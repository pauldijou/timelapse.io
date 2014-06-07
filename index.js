#!/usr/bin/env node

var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    inquirer = require('inquirer'),
    path = require('path'),
    ExifImage = require('exif').ExifImage;
    homeDir = require('home-dir').directory,
    configDir = path.join(homeDir, '/.timelapse.io'),
    configFile = path.join (configDir, '/timelapseio.json'),
    config = {
      inputs: [],
      outputs: []
    },
    workspace = {},
    speeds = [500, 1000, 2000, 5000, 10000, 30000];

var info = function (message) {
  console.log(message);
};

var debugSeparator = function () {
  console.log('------------------------------------');
};

var debug = function (message) {
  console.log(message);
  debugSeparator();
};

var saveConfig = function () {
  return fs.write(configFile, JSON.stringify(config, null, 2)).then(function () {
    return config;
  });
};

// var stats = function (path) {
//   try {
//     return fs.statSync(path);
//   } catch (e) {
//     return undefined;
//   }
// };

var stepPercent = function (index, total, step, message) {
  var migap = 50 / total,
      nbSteps = 100 / step,
      result = false,
      progress = 100 * index / total;

  for(var i = 1; i <= nbSteps; ++i) {
    if (((i * step - migap) <= progress) && (progress < (i * step + migap))) {
      result = i * step;
      if (message) {
        console.info(message, result);
      }
    }
  }

  return result;
};

var exifDate = function (dirtyDate) {
  var parts = dirtyDate.split(' ');
  return new Date(parts[0].replace(/:/g, '-') + 'T' + parts[1] + 'Z');
};

var answerOther = 'Other';
var isOther = function (answer) {
  return answer === answerOther;
};

var checkConfigDir = function ()  {
  return fs.stat(configDir).then(function (stats) {
    return stats;
  }, function (err) {
    return makeDirectory(configDir);
  });
};

var checkConfigFile = function () {
  return fs.read(configFile).then(function (content) {
    config = JSON.parse(content);
    return config;
  }, function (err) {
    return saveConfig();
  });
};

var validDirectory = function (answer, done) {
  fs.isDirectory(answer).then(function (dir) {
    done(dir || 'Please pick a valid directory or add a new one');
  }, function (err) {
    done('Please pick a valid directory or add a new one');
  });
};


var promptIO = function (config) {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'input',
    type: 'list',
    message: 'Where are your photos?',
    default: (config.inputs.length && config.inputs[0]) || 'Other',
    choices: config.inputs.concat(['Other']),
    validate: function (answer) {
      var done = this.async();
      if (isOther(answer)) done(true);
      else validDirectory(answer, done);
    }
  },{
    name: 'inputDir',
    type: 'input',
    message: 'Please enter a valid path',
    when: function (answers) { return isOther(answers.input); },
    validate: function (answer) {
      var done = this.async();
      validDirectory(answer, done);
    }
  },{
    name: 'inputSave',
    type: 'confirm',
    message: 'Should we save this new path for later use?',
    default: true,
    when: function (answers) { return isOther(answers.input); }
  },{
    name: 'output',
    type: 'list',
    message: 'Where should we put the resulting video?',
    default: (config.inputs.length && config.outputs[0]) || 'Other',
    choices: config.outputs.concat(['Other']),
    validate: function (answer) {
      var done = this.async();
      if (isOther(answer)) done(true);
      else validDirectory(answer, done);
    }
  },{
    name: 'outputDir',
    type: 'input',
    message: 'Please enter a valid path',
    when: function (answers) { return isOther(answers.output); },
    validate: function (answer) {
      var done = this.async();
      validDirectory(answer, done);
    }
  },{
    name: 'outputSave',
    type: 'confirm',
    message: 'Should we save this new path for later use?',
    default: true,
    when: function (answers) { return isOther(answers.output); }
  }], function (answers) {
    workspace.input = answers.inputDir || answers.input;
    workspace.output = answers.outputDir || answers.output;

    if (answers.inputDir && answers.inputSave) {
      config.inputs.push(answers.inputDir);
    }

    if (answers.outputDir && answers.outputSave) {
      config.outputs.push(answers.outputDir);
    }

    saveConfig().done(function () {
      defer.resolve(workspace);
    }, function (err) {
      defer.reject(err);
    });
  });

  return defer.promise;
};

var getFiles = function getFilesF(workspace) {
  return fs.list(workspace.input).then(function (files) {
    var total = files.length;
    info('Start reading ' + total + ' files and/or directories and extracting EXIF infos (can take a few seconds)...');
    return q.allSettled(_.map(files, function (fileName, index) {
      var filePath = path.join(workspace.input, fileName);
      return fs.stat(filePath).then(function (stats) {
        if (stats.isFile()) {
          var defer = q.defer();
          // stats.path = filePath;
          try {
            new ExifImage({ image : filePath }, function (err, exifData) {
              if (err) {
                defer.reject(err);
              } else {
                // stats.exif = exifData;
                // defer.resolve(stats);
                defer.resolve({
                  path: filePath,
                  width: exifData.exif.ExifImageWidth,
                  height: exifData.exif.ExifImageHeight,
                  created: exifDate(exifData.exif.CreateDate),
                  dateTimeOriginal: exifDate(exifData.exif.DateTimeOriginal),
                  hardware: exifData.image.Make + '---' + exifData.image.Model
                });
              }
            });
          } catch (error) {
            defer.reject(err);
          }
          return defer.promise;
        } else if (stats.isDirectory()) {
          return getFilesF(filePath);
        } else {
          return q([]);
        }
      });
    })).then(function (promises) {
      return _(promises).filter(function (promise) {
        return promise.state === 'fulfilled';
      }).map(function (promise) {
        return promise.value;
      }).flatten().value();
    });
  });
};

var timelapseMinSize = 100;

var extractTimelapse = function (files, start) {
  start = start || 0;

  if ((files.length - start) < timelapseMinSize) {
    return undefined;
  } else {
    var nearSpeed = (files[start + timelapseMinSize - 1].created.getTime() - files[start].created.getTime()) / timelapseMinSize,
        timelapse = {
          start: start,
          files: []
        };

    _.forEach(speeds, function (speed) {
      if ((0.75 * speed) < nearSpeed && nearSpeed < (1.25 * speed)) {
        timelapse.speed = speed;
      }
    });

    var current = start;
    var isNextValid = true;
    var maxCurrent = files.length;

    while(isNextValid) {
      var currentFile = files[current];
      var nextFile = files[current + 1];

      timelapse.files.push(currentFile);

      isNextValid = nextFile
        && ((nextFile.created.getTime() - currentFile.created.getTime()) <= (timelapse.speed + 1000))
        && (nextFile.hardware === currentFile.hardware);

      ++current;
    }

    timelapse.end = current - 1;
    timelapse.length = timelapse.files.length;
    timelapse.fps = 30;
    timelapse.duration = timelapse.length / timelapse.fps * 1000;

    return timelapse;
  }

};

var timelapseToString = function (timelapse) {
  return (timelapse.duration / 1000)
    + 'sec ('
    + timelapse.length
    + ' files at '
    + timelapse.fps
    + ' FPS, speed: '
    + (timelapse.speed / 1000)
    + 'sec), from '
    + timelapse.files[0].path
    + ' to '
    + timelapse.files[timelapse.length - 1].path;
};

var analyseFiles = function (files) {
  info('Total: ' + files.length + ' files');
  info(' ');
  info('Now searching for timelapses...');

  var defer = q.defer();
  var timelapses = [];

  if (files.length < timelapseMinSize) {
    info('I don\'t think you have enough files to make a timelapse :-(');
    defer.reject('Not enough files');
  } else {
    var timelapse = extractTimelapse(files, 0);

    while(timelapse) {
      timelapses.push(timelapse);
      timelapse = extractTimelapse(files, timelapse.end + 1);
    }

    defer.resolve(timelapses);
  }

  return defer.promise;
};

// Logic
checkConfigDir()
  .then(checkConfigFile)
  .then(promptIO)
  .then(getFiles)
  .then(analyseFiles)
  .done(function (timelapses) {
    info('Total: ' + timelapses.length + ' timelapse(s)');
    _.forEach(timelapses, function (timelapse, index) {
      info('  Timelapse #' + (index+1) + ': ' + timelapseToString(timelapse));
    });
  });
