module.exports.debug = function (message) {
  console.log(message);
};

module.exports.info = function (message) {
  console.log(message);
};

module.exports.warn = function (message) {
  console.log('WARNING: ' + message);
};

module.exports.error = function (message) {
  console.log('ERROR: ' + message);
};

module.exports.json = function (obj) {
  console.log(JSON.stringify(obj));
};
