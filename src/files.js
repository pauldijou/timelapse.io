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

    var chunkSize = 500;
    if (total < 500) {
      chunkSize = 50;
    } else if (total < 1000) {
      chunkSize = 100;
    } else if (total < 2500) {
      chunkSize = 250;
    }

    var result = q([]);

    for (var i = 0; i < total; i += chunkSize) {
      (function (chunk, progress) {
        console.log("Analyzing files... " + Math.ceil(100 * progress) + "%");
        result = result.then(function (values) {
          return q.allSettled(_.map(chunk, function (filePath) {
            return toExif(filePath);
          })).then(function (exifValues) {
            return values.concat(exifValues);
          });
        });
      })(files.slice(i, i + chunkSize), i / total);
    }

    return result;
  })
  // Remove failed promises (for example, couldn't read EXIF metadata)
  .then(function (promises) {
    log.info('Removing invalid files and ordering by created date...');
    return _(promises).filter(function (promise) {
      return promise.state === 'fulfilled';
    }).map(function (promise) {
      return promise.value;
    }).flatten().sortBy(function (file) {
      return file.created.getTime();
    }).value();
  });
};
