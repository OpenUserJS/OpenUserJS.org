module.exports = function (grunt) {

  'use strict';

  var pkg = require("./package.json");

  pkg.timestamp = new Date().getTime();

  grunt.initConfig({
    pkg: pkg,
    clean: require('./tasks/clean.js'),
    copy: require('./tasks/copy.js'),
    jshint: require('./tasks/jshint.js')
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  // called without any further parameter: 'grunt'
  grunt.registerTask('default', ['jshint']);
  // build: 'grunt build'
  grunt.registerTask('build', [
    //check jss
    //'jshint',
    //clean old build
    'clean',
    //copy root and img files
    'copy'
  ]);
};
