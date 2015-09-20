var gulp = require('gulp');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var eslint = require('gulp-eslint');
var jasmine = require('gulp-jasmine');

var paths = {
  main_js: ['js/vertex.js'],
  js: ['js/*.js']
};

gulp.task('lint', function() {
  return gulp.src('js/**/*.js')
      .pipe(eslint({
        rules: {
          'strict': 2
        },
      }))
      .pipe(eslint.format())
      .pipe(eslint.failOnError());
});

gulp.task('build', ['lint'], function() {
  var b = browserify({
    paths: [
      __dirname + '/js'
    ],
    debug: true
  });
  b.add(__dirname + '/js/quadtreemesher.js');
  b.bundle()
      .on('error', function(error) {
        console.log(error.message); 
        this.emit('end');
       })
      .pipe(source('cleaver.js'))
      .pipe(gulp.dest('./build/'));
});

gulp.task('test', ['build'], function() {
  return gulp.src('spec/*Spec.js')
    .pipe(jasmine({ verbose: true }));
});

gulp.task('copy', ['test'], function() {
    gulp.src('html/**/*').pipe(gulp.dest('build/'));
});

// Default Task
gulp.task('default', ['lint', 'build', 'test', 'copy']);
