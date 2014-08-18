var q = require('q'),
    _ = require('lodash');

// Round a number by a number of digits
module.exports.round = function (value, digits) {
  digits = (digits === undefined) ? 2 : digits;
  var hundreds = Math.pow(10, digits);
  return (Math.round(hundreds * value) / hundreds);
};

// Display the 'message' if 'index' is around one of steps among 'total'
// All steps are calculated by dividing 100 by 'step'
// Ex: stepPercent(_, _, 10, 'toto') will log 'toto' if 'index' is 10% or 20% ... or 100% of 'total'
module.exports.stepPercent = function (index, total, step, message) {
  var migap = 50 / total,
      nbSteps = 100 / step,
      result = false,
      progress = 100 * index / total;

  for(var i = 1; i <= nbSteps; ++i) {
    if (((i * step - migap) <= progress) && (progress < (i * step + migap))) {
      result = i * step;
      if (message) {
        console.log(message, result);
      }
    }
  }

  return result;
};

module.exports.catchError = function (type, error) {
  var defer = q.defer();

  if (error.type === type) {
    defer.resolve(true);
  } else {
    defer.reject(error);
  }

  return defer.promise;
};

module.exports.exifDate = function (dirtyDate) {
  var parts = dirtyDate.split(' ');
  return new Date(parts[0].replace(/:/g, '-') + 'T' + parts[1] + 'Z');
};

var chunkSize = module.exports.chunkSize = function chunkSize(total) {
  if (total < 500) {
    return 50;
  } else if (total < 1000) {
    return 100;
  } else if (total < 2500) {
    return 250;
  } else {
    return 500;
  }
};

module.exports.chunkMap = function (values, fn) {
  var total = values.length;
  var chunkLength = chunkSize(total);
  var result = q([]);

  for (var i = 0; i < total; i += chunkLength) {
    (function (chunk, progress) {
      console.log("Progress... " + Math.ceil(100 * progress) + "%");
      result = result.then(function (promiseValues) {
        return q.allSettled(_.map(chunk, fn)).then(function (chunkValues) {
          return promiseValues.concat(chunkValues);
        });
      });
    })(values.slice(i, i + chunkLength), i / total);
  }

  return result.then(function (promises) {
    log.info('Removing invalid values...');
    return _(promises).filter(function (promise) {
      return promise.state === 'fulfilled';
    }).map(function (promise) {
      return promise.value;
    }).value();
  });;
};
