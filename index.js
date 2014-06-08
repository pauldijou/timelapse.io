#!/usr/bin/env node

var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    inquirer = require('inquirer'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    ExifImage = require('exif').ExifImage;
    homeDir = require('home-dir').directory,
    configDir = path.join(homeDir, '/.timelapse.io'),
    configFile = path.join (configDir, '/timelapseio.json'),
    tmpDir = path.join (configDir, '/tmp'),
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
    return fs.makeDirectory(configDir);
  });
};

var checkTmpDir = function ()  {
  return fs.stat(tmpDir).then(function (stats) {
    return stats;
  }, function (err) {
    return fs.makeDirectory(tmpDir);
  });
};

var cleanTmpDir = function () {
  return fs.removeTree(tmpDir).then(checkTmpDir);
};

var checkConfigFile = function () {
  return fs.read(configFile).then(function (content) {
    config = JSON.parse(content);
    return config;
  }, function (err) {
    return saveConfig();
  });
};

var askForDelete = function (filePath) {
  return fs.stat(filePath).then(function (stats) {
    var defer = q.defer();

    inquirer.prompt([{
      name: 'delete',
      type: 'confirm',
      message: 'File "' + filePath + '" already exists. Overwrite?',
      default: true
    }], function (answers) {
      if (answers.delete) {
        fs.remove(filePath).then(function () {
          defer.resolve(true);
        }, function (err) {
          defer.reject(err);
        });
      } else {
        defer.reject(false);
      }
    });

    return defer.promise;
  }, function () {
    return q(true);
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
  return q.all([q(workspace), fs.list(workspace.input).then(function (files) {
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
                info('WARNING: couldn\'t read EXIF data from ' + filePath);
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
          return getFilesF({input: filePath}).spread(function (workspace, files) { return files; });
        } else {
          return q([]);
        }
      });
    })).then(function (promises) {
      info('Removing invalid files and ordering by created date...');
      return _(promises).filter(function (promise) {
        return promise.state === 'fulfilled';
      }).map(function (promise) {
        return promise.value;
      }).flatten().sortBy(function (file) {
        return file.created.getTime();
      }).value();
    });
  })]);
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

    timelapse.extension = path.extname(timelapse.files[0].path);
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

var analyseFiles = function (workspace, files) {
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

    info('Total: ' + timelapses.length + ' timelapse(s)');
    defer.resolve([workspace, timelapses]);
  }

  return defer.promise;
};

var promptTimelapse = function (workspace, timelapses) {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'timelapse',
    type: 'list',
    message: 'Please, pick a timelapse to process or exit',
    choices: _.map(timelapses, function (t) { return {name: timelapseToString(t), value: t} }).concat({name: 'Exit', value: undefined})
  },{
    name: 'fileName',
    type: 'input',
    message: 'How do you want to name your timelapse? Please include file extension (ex: sky.avi)',
    when: function (answers) {
      return !!answers.timelapse;
    },
    validate: function (answer) {
      if (!answer) {
        return 'You must specify a name';
      } else if (answer.indexOf('.') < 0) {
        return 'You must specify the file extension (ex: sky.avi)';
      } else {
        return true;
      }
    }
  }], function (answers) {
    if (answers.timelapse) {
      workspace.name = answers.fileName;
      defer.promise.spread(promptPreview);
      defer.resolve([workspace, timelapses, answers.timelapse]);
    } else {
      defer.resolve('exit');
    }
  });

  return defer.promise;
};

var promptPreview = function (workspace, timelapses, timelapse) {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'preview',
    type: 'confirm',
    message: 'Would you like to generate a small preview before processing the full timelapse?',
    default: true
  }], function (answers) {
    if (answers.preview) {
      defer.promise.spread(generatePreview);
    } else {
      defer.promise.spread(promptTimelapseBoundaries);
    }

    defer.resolve([workspace, timelapses, timelapse]);
  });

  return defer.promise;
};

var writeTimelapse = function (output, timelapse, start, end) {
  start = start || 0;
  end = end || timelapse.files.length;

  var filesToProcess = timelapse.files.slice(start, end);

  return askForDelete(output).then(cleanTmpDir).then(function () {
    info('Copying and renaming files in tmp directory...');
    return q.all(_.map(filesToProcess, function (file, index) {
      return fs.copy(file.path, path.join(tmpDir, (index+1) + timelapse.extension));
    }));
  }).then(function () {
    var defer = q.defer();
    // avconv -f image2 -framerate 30 -i "/input/tmp/%d.JPG" -filter:v scale=-1:1080 "/output/sky.avi"

    var args = [
      '-f',
      'image2',
      '-framerate',
      '30',
      '-i',
      '"' + path.join(tmpDir, '%d' + timelapse.extension) + '"',
      // '"' + ('%d' + timelapse.extension) + '"',
      // '-filter:v',
      // 'scale=-1:1080',
      '"' + output + '"'
    ];

    info('Starting generating timelapse, this can take some time (up to a few minutes)...');
    info('Running: avconv ' + args.join(' '));
    info(' ');

    // var avconv = spawn('avconv', args, {
    //   cwd: tmpDir,
    //   env: process.env,
    //   detached: true,
    //   stdio: 'inherit'
    // }).unref();

    // avconv.on('close', function (code) {
    //   console.log('child process exited with code ' + code);
    //   defer.resolve(code);  
    // });

    exec('avconv ' + args.join(' '), function (error, stdout, stderr) {
      if (error) { info('ERROR: ' + error); }
      info(stdout);
      info(stderr);
      defer.resolve(output);
    });

    return defer.promise;
  });
};

var generatePreview = function (workspace, timelapses, timelapse) {
  return writeTimelapse(path.join(workspace.output, 'preview-' + workspace.name), timelapse, 0, timelapseMinSize)
    .then(askIsPreviewOk)
    .then(function () {
      return promptTimelapseBoundaries(workspace, timelapses, timelapse);
    });
};

var askIsPreviewOk = function (output) {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'previewOk',
    type: 'confirm',
    message: 'The preview has been generated at "' + output + '". Shall we proceed to the full timelapse now?',
    default: true
  }], function (answers) {
    if (answers.previewOk) {
      defer.resolve(true)
    } else {
      defer.reject({
        step: 'askIsPreviewOk',
        message: 'Since you didn\'t like the preview, process has been canceled.'
      });
    }
  });

  return defer.promise;
};

var promptTimelapseBoundaries = function (workspace, timelapses, timelapse) {
  var defer = q.defer();

  // 0 -> All timelapse
  // 1 -> Limit by duration
  // 2 -> Limit by file names
  // 3 -> Limit by indexes

  var intToBounds = function (input, isStart, answers) {
    var bounds = {};

    switch (input) {
      case 1:
        bounds.min = (isStart ? 0 : (answers.start || 0));
        bounds.max = timelapse.duration;
        break;
      case 2:
        bounds.min = (isStart ? timelapse.files[0].path : (answers.start || timelapse.files[0].path));
        bounds.min = timelapse.files[timelapse.files.length].path;
        break;
      case 3:
        bounds.min = (isStart ? 0 : (answers.start || 0));
        bounds.max = timelapse.files.length;
        break;
    }

    return bounds;
  };

  var intValidate = function (input, isStart, answers) {
    return function (value) {
      var bounds = intToBounds(input, isStart, answers);
      var isValid = true;

       if (bounds.min !== undefined && value < bounds.min) {
        isValid = 'The value must be greater than ' + bounds.min;
       }

       if (bounds.max !== undefined && value > bounds.max) {
        isValid = 'The value must be lower than ' + bounds.max;
       }

       return isValid;
     }
  };

  var intToMessage = function (input, isStart, answers) {
    var message = 'Invalid value: ' + input;
    var bounds = intToBounds(input, isStart, answers);
    var endMessage = (isStart ? 'start' : 'stop')
      + '? Leave empty to '
      + (isStart ? 'start at the beginning' : 'stop at the end')
      + '. Must be between '
      + bounds.min
      + ' and '
      + bounds.max;

    switch (input) {
      case 1:
        message = 'At what time (in ms) do you want to ' + endMessage;
        break;
      case 2:
        message = 'At what file do you want to ' + endMessage;
        break;
      case 3:
        message = 'At what index do you want to ' + endMessage;
        break;
    }
    return message;
  };

  var intToIndex = function (input, value, isStart) {
    var result = value || (isStart ? 0 : timelapse.files.length);

    if (value) {
      switch (input) {
        case 1:
          result = parseInt(timelapse.files.length * value / timelapse.duration, 10);
          break;
        case 2:
          result = _.findIndex(timelapse.files, function (file) {
            return path.basename(file.path) === value || path.basename(file.path, path.extname(file.path)) === value;
          });
          break;
      }
    }
    
    return result;
  };

  // Memorizing next step
  defer.promise.spread(generateTimelapse);

  inquirer.prompt([{
    name: 'boundType',
    type: 'list',
    message: 'Do you want to generate the full timelapse or only a subset of it?',
    choices: [
      {value: 0, name: 'All of it'},
      {value: 1, name: 'Subset it with duration'},
      {value: 2, name: 'Subset it with file names'},
      {value: 3, name: 'Subset it with indexes'}
    ]
  }], function (answerBound) {
    if (answerBound.boundType === 0) {
      defer.resolve([
        workspace,
        timelapses,
        timelapse
      ]);
    } else {
      inquirer.prompt([{
        name: 'start',
        type: 'input',
        message: intToMessage(answerBound.boundType, true, answerBound),
        validate: intValidate(answerBound.boundType, true, answerBound)
      }], function (answerStart) {
        inquirer.prompt([{
          name: 'end',
          type: 'input',
          message: intToMessage(answerStart.boundType, false, answerStart),
          validate: intValidate(answerBound.boundType, true, answerStart)
        }], function (answerEnd) {
          defer.resolve([
            workspace,
            timelapses,
            timelapse,
            intToIndex(answerBound.boundType, answerStart.start, true),
            intToIndex(answerBound.boundType, answerEnd.end, false)
          ]);
        });
      });
    }
  });

  return defer.promise;
};

var generateTimelapse = function (workspace, timelapses, timelapse, start, end) {
  return writeTimelapse(path.join(workspace.output, workspace.name), timelapse, start, end);
};

// Logic
checkConfigDir()
  .then(checkTmpDir)
  .then(checkConfigFile)
  .then(promptIO)
  .then(getFiles)
  .spread(analyseFiles)
  .spread(promptTimelapse)
  .then(cleanTmpDir)
  .catch(function (err) {
    cleanTmpDir();
    if (err && err.message) {
      info(err.message);
    } else if (err) {
      info(err);
    }
  })
  .done();
