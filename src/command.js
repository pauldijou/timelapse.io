var q = require('q'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    log = require('./log');

module.exports.run = function (command) {
  var defer = q.defer();

  // var args = command.split(' ');
  // var runner = spawn(args[0], args.slice(1), {
  //   detached: true,
  //   stdio: 'inherit'
  // }).unref();

  // runner.on('close', function (code) {
  //   console.log('child process exited with code ' + code);
  //   defer.resolve(code);  
  // });

  exec(command, function (err, stdout, stderr) {
    log.info(stdout);
    log.info(stderr);

    if (err) {
      defer.reject(err);
    } else {
      defer.resolve('done');
    }
  });

  return defer.promise;
};
