var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    inquirer = require('inquirer'),
    path = require('path'),
    home = require('./home');
    log = require('./log');
    timelapse = require('./timelapse');
    workspace = require('./workspace');

var valid = module.exports.valid = {
  directory: function (answer, done) {
    fs.isDirectory(answer).then(function (dir) {
      done(dir || 'Please pick a valid directory or add a new one');
    }, function (err) {
      done('Please pick a valid directory or add a new one');
    });
  }
};

module.exports.workspace = function () {
  var defer = q.defer();
  var config = home.config();

  var answerOther = 'Other';
  var isOther = function (answer) {
    return answer === answerOther;
  };

  inquirer.prompt([{
    name: 'input',
    type: 'list',
    message: 'Where are your photos?',
    default: (config.inputs.length && config.inputs[0]) || answerOther,
    choices: config.inputs.concat([answerOther]),
    validate: function (answer) {
      var done = this.async();
      if (isOther(answer)) done(true);
      else valid.directory(answer, done);
    }
  },{
    name: 'inputDir',
    type: 'input',
    message: 'Please enter a valid path',
    when: function (answers) { return isOther(answers.input); },
    validate: function (answer) {
      var done = this.async();
      valid.directory(answer, done);
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
    default: (config.inputs.length && config.outputs[0]) || answerOther,
    choices: config.outputs.concat([answerOther]),
    validate: function (answer) {
      var done = this.async();
      if (isOther(answer)) done(true);
      else valid.directory(answer, done);
    }
  },{
    name: 'outputDir',
    type: 'input',
    message: 'Please enter a valid path',
    when: function (answers) { return isOther(answers.output); },
    validate: function (answer) {
      var done = this.async();
      valid.directory(answer, done);
    }
  },{
    name: 'outputSave',
    type: 'confirm',
    message: 'Should we save this new path for later use?',
    default: true,
    when: function (answers) { return isOther(answers.output); }
  }], function (answers) {
    workspace.setInput(answers.inputDir || answers.input);
    workspace.setOutput(answers.outputDir || answers.output);

    if (answers.inputDir && answers.inputSave) {
      config.inputs.push(answers.inputDir);
    }

    if (answers.outputDir && answers.outputSave) {
      config.outputs.push(answers.outputDir);
    }

    home.save().done(function () {
      defer.resolve(workspace);
    }, function (err) {
      defer.reject(err);
    });
  });

  return defer.promise;
};

module.exports.overwrite = function (filePath) {
  return fs.stat(filePath).then(function (stats) {
    var defer = q.defer();

    inquirer.prompt([{
      name: 'overwrite',
      type: 'confirm',
      message: 'File "' + filePath + '" already exists. Overwrite?',
      default: true
    }], function (answers) {
      if (answers.overwrite) {
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

module.exports.timelapse = function (timelapses) {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'timelapse',
    type: 'list',
    message: 'Please, pick a timelapse to process or exit',
    choices: _.map(workspace.getTimelapses(), function (t) {
      return {name: timelapse.toString(t), value: t};
    }).concat({name: 'Exit', value: undefined})
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
      workspace.setName(answers.fileName);
      workspace.setTimelapse(answers.timelapse);
      // defer.promise.spread(promptPreview);
      defer.resolve(answers.timelapse);
    } else {
      defer.reject('exit');
    }
  });

  return defer.promise;
};

module.exports.preview = function () {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'preview',
    type: 'confirm',
    message: 'Would you like to generate a small preview before processing the full timelapse?',
    default: true
  }], function (answers) {
    // if (answers.preview) {
    //   defer.promise.spread(generatePreview);
    // } else {
    //   defer.promise.spread(promptTimelapseBoundaries);
    // }

    defer.resolve(answers.preview);
  });

  return defer.promise;
};

module.exports.previewOk = function () {
  var defer = q.defer();

  inquirer.prompt([{
    name: 'previewOk',
    type: 'confirm',
    message: 'The preview has been generated at "' + workspace.getOutputFilePreview() + '". Shall we proceed to the full timelapse now?',
    default: true
  }], function (answers) {
    defer.resolve(answers.previewOk);
  });

  return defer.promise;
};

module.exports.timelapseBoundaries = function () {
  var defer = q.defer(),
      timelapse = workspace.getTimelapse();

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
  // defer.promise.spread(generateTimelapse);

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
      defer.resolve([0, timelapse.files.length]);
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
            intToIndex(answerBound.boundType, answerStart.start, true),
            intToIndex(answerBound.boundType, answerEnd.end, false)
          ]);
        });
      });
    }
  });

  return defer.promise;
};
