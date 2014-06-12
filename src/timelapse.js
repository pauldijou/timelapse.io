var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    path = require('path'),
    home = require('./home');
    command = require('./command'),
    prompts = require('./prompts'),
    log = require('./log'),
    utils = require('./utils'),
    workspace = require('./workspace');

var extract = module.exports.extract = function (files, start) {
  start = start || 0;
  var timelapseMinSize = home.config().timelapseMinSize;

  if ((files.length - start) < timelapseMinSize) {
    return undefined;
  } else {
    var nearSpeed = (files[start + timelapseMinSize - 1].created.getTime() - files[start].created.getTime()) / timelapseMinSize,
        timelapse = {
          start: start,
          files: []
        };

    _.forEach(home.config().speeds, function (speed) {
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

var toString = module.exports.toString = function (timelapse) {
  return utils.round(timelapse.duration / 1000, 2)
    + 'sec ('
    + timelapse.length
    + ' files at '
    + timelapse.fps
    + ' FPS, speed: '
    + utils.round(timelapse.speed / 1000, 2)
    + 'sec), from '
    + timelapse.files[0].path
    + ' to '
    + timelapse.files[timelapse.length - 1].path;
};

module.exports.analyse = function (files) {
  log.info('Total: ' + files.length + ' files');
  log.info(' ');
  log.info('Now searching for timelapses...');

  var defer = q.defer();
  var timelapses = [];
  var timelapseMinSize = home.config().timelapseMinSize

  if (files.length < timelapseMinSize) {
    log.info('I don\'t think you have enough files to make a timelapse :-(');
    defer.reject('Not enough files');
  } else {
    var timelapse = extract(files, 0);

    while(timelapse) {
      if (timelapse.files.length >= timelapseMinSize) timelapses.push(timelapse);
      timelapse = extract(files, timelapse.end + 1);
    }

    log.info('Total: ' + timelapses.length + ' timelapse(s)');
    workspace.setTimelapses(timelapses);
    defer.resolve(timelapses);
  }

  return defer.promise;
};

var write = module.exports.write = function (output, start, end) {
  var timelapse = workspace.getTimelapse(),
      filesToProcess = timelapse.files.slice(start, end),
      output = workspace.getOutputFile();

  start = start || 0;
  end = end || timelapse.files.length;

  return prompts.overwrite(output).then(home.clean).then(function () {
    log.info('Copying and renaming files in tmp directory...');
    return q.all(_.map(filesToProcess, function (file, index) {
      return fs.copy(file.path, path.join(tmpDir, (index+1) + timelapse.extension));
    }));
  }).then(function () {
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

    return command.run('avconv ' + args.join(' '));
  });
};

module.exports.generatePreview = function () {
  return write(workspace.getOutputFilePreview(), 0, home.config().timelapseMinSize);
};

module.exports.generate = function (start, end) {
  return write(workspace.getOutputFile(), start, end);
};
