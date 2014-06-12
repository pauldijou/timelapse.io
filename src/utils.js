var q = require('q');

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
