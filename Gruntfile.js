module.exports = function (grunt) {

  'use strict';

  var pkg = require("./package.json");

  pkg.timestamp = new Date().getTime();

  grunt.initConfig({
    pkg: pkg,
    clean: require('./tasks/clean.js'),
    copy: require('./tasks/copy.js'),
    cssmin: require('./tasks/cssmin.js'),
    htmlmin: require('./tasks/htmlmin.js'),
    jshint: require('./tasks/jshint.js'),
    uglify: require('./tasks/uglify.js')
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-htmlmin');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  // called without any further parameter: 'grunt'
  grunt.registerTask('default', ['jshint']);
  // build: 'grunt build'
  grunt.registerTask('build', [
    //check jss
    'jshint',
    //clean old build
    'clean',
    //copy root and img files
    'copy',
    //minify html/js/css
    'htmlmin',
    'uglify',
    'cssmin'
  ]);
};
