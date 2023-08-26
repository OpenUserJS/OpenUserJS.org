module.exports = {
  minify: {
    files: [{
      expand: true,
      cwd: 'public/css',
      src: '**/*.css',
      dest: 'builds/public/css'
    }]
  }
};
