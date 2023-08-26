module.exports = {
  dist: {
    options: {
      removeComments: true,
      collapseWhitespace: true
    },
    files: [{
      expand: true,
      cwd: 'views/',
      src: '**/*.html',
      dest: 'builds/views/'
    }]
  }
};
