var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    path = require('path'),
    ExifImage = require('exif').ExifImage,
    log = require('./log'),
    utils = require('./utils'),
    workspace = require('./workspace');

var toExif = module.exports.toExif = function (filePath) {
  var defer = q.defer();
  try {
    new ExifImage({ image : filePath }, function (err, exifData) {
      if (err) {
        log.warn('couldn\'t read EXIF data from "' + filePath + '", reason: ' + err);
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

module.exports.read = function getFiles() {
  // Get a flat array of all files on workspace
  return fs.listTree(workspace.getInput(), function (path, stat) {
    return stat.isFile();
  })
  // Chunk files so we don't open too many of them at the same time
  .then(function (files) {
    var total = files.length;
    log.info('Start reading ' + total + ' files and/or directories and extracting EXIF infos (can take a few '+ (total < 500 ? 'seconds' : 'minutes') +')...');

    console.log('Analyzing files...')
    return utils.chunkMap(files, toExif);
  })
  // Remove failed promises (for example, couldn't read EXIF metadata)
  .then(function (values) {
    log.info('Ordering by created date...');
    return _.sortBy(values, function (file) {
      return file.created.getTime();
    });
  });
};
