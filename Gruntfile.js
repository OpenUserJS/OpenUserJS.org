module.exports = function (grunt) {

  'use strict';

  var pkg = require("./package.json");

  pkg.timestamp = new Date().getTime();

  // Initializes the Grunt tasks with the following settings
  grunt.initConfig({
      pkg: pkg,
      jshint: require('./tasks/jshint.js')
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');

  // is called without any further parameter.
  grunt.registerTask('default', ['jshint']);

};
