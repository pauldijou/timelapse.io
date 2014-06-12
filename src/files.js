var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    path = require('path'),
    ExifImage = require('exif').ExifImage,
    log = require('./log'),
    workspace = require('./workspace');

var toExif = module.exports.toExif = function (filePath) {
  var defer = q.defer();
  try {
    new ExifImage({ image : filePath }, function (err, exifData) {
      if (err) {
        log.warn('couldn\'t read EXIF data from "' + filePath + '"');
        defer.reject(err);
      } else {
        defer.resolve({
          path: filePath,
          width: exifData.exif.ExifImageWidth,
          height: exifData.exif.ExifImageHeight,
          created: utils.exifDate(exifData.exif.CreateDate),
          dateTimeOriginal: utils.exifDate(exifData.exif.DateTimeOriginal),
          hardware: exifData.image.Make + '---' + exifData.image.Model
        });
      }
    });
  } catch (error) {
    defer.reject(err);
  }
  return defer.promise;
};

module.exports.read = function getFiles(inputDir) {
  var isRoot = !!inputDir;
  inputDir = inputDir || workspace.getInput();

  return fs.list(inputDir).then(function (files) {
    var total = files.length;

    if (isRoot) {
      log.info('Start reading ' + total + ' files and/or directories and extracting EXIF infos (can take a few '+ (total < 300 ? 'seconds' : 'minutes') +')...');
    } else {
      log.info('Found a directory, importing ' + total + ' more files and extracting EXIF infos (can take a few '+ (total < 300 ? 'seconds' : 'minutes') +')...');
    }

    return q.allSettled(_.map(files, function (fileName, index) {
      var filePath = path.join(inputDir, fileName);
      return fs.stat(filePath).then(function (stats) {
        if (stats.isFile()) {
          return toExif(filePath);
        } else if (stats.isDirectory()) {
          return getFiles(filePath);
        } else {
          return q([]);
        }
      });
    })).then(function (promises) {
      log.info('Removing invalid files and ordering by created date...');
      return _(promises).filter(function (promise) {
        return promise.state === 'fulfilled';
      }).map(function (promise) {
        return promise.value;
      }).flatten().sortBy(function (file) {
        return file.created.getTime();
      }).value();
    });
  });
};
