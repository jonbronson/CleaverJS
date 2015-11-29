var Matrix = require('../js/matrix');
var Vector = require('../js/geometry/vector');

describe('Matrix Tests', function() {

  describe('Initialization', function() {
    it('should create an identity matrix if no parameters given', function() {
      var A = new Matrix();
      checkIsIdentity(A);
    });

    it('should create a new matrix object with the given values', function() {
      var A = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9);
      var counter = 1;
      for (var i=0; i < 3; i++) {
        for (var j=0; j < 3; j++) {
          expect(A[i][j]).toBe(counter++);
        }
      }
    });
  });

  // TODO: Verify externally. (matlab/wolfram/etc)
  describe('Multiplication', function() {
    it('should multiply two matrices together properly', function() {
      var A = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9);
      var B = new Matrix(9, 8, 7, 6, 5, 4, 3, 2, 1);
      var result = A.multiply(B);
      var expected = new Matrix(30, 24, 18, 84, 69, 54, 138, 114, 90);
      expect(result).toEqual(expected);
    });

    it('should multiply a matrix with a vector properly', function() {
      var A = Matrix.createScale(2, 3);
      var x = new Vector(1, 2);
      var result = A.multiplyVector(x);
      var expected = new Vector(2, 6);
      expect(result).toEqual(expected);
    });
  });

  describe('Inverse', function() {
    it('should create an inverse for invertible matrices', function() {
      var A = new Matrix(1, 2, 3, 4, 8, 4, 3, 2, 1);
      var B = A.inverse();
      var result = A.multiply(B);
      var identity = new Matrix();
      expect(result).toEqual(identity);
    });

    // TODO: Maybe throw error if matrix is not invertible
  });

  describe('Static Creation Methods', function() {
    it('should create rotation matrix and return it', function() {
      var A = Matrix.createRotation(Math.PI / 2);
      var x = new Vector(1, 0);
      var result = A.multiplyVector(x);
      var expected = new Vector(0, 1);
      expect(result.x).toBeCloseTo(expected.x, 6);
      expect(result.y).toBeCloseTo(expected.y, 6);
    });

    it('should create a translation matrix and return it', function() {
      var A = Matrix.createTranslation(10, -10);
      var x = new Vector(7, 2);
      var result = A.multiplyVector(x);
      var expected = new Vector(17, -8);
      expect(result).toEqual(expected);
    });

    it('should create a scaling matrix and return it', function() {
      var A = Matrix.createScale(2, 2);
      var x = new Vector(7, 2);
      var result = A.multiplyVector(x);
      var expected = new Vector(14, 4);
      expect(result).toEqual(expected);
    });
  });


  /**
   * Helper method to check if a matrix is the identity matrix.
   */
   var checkIsIdentity = function(matrix) {
     for (var i=0; i < 3; i++) {
       for (var j=0; j < 3; j++) {
         if (i == j) {
           expect(matrix[i][j]).toBe(1);
         } else {
           expect(matrix[i][j]).toBe(0);
         }
       }
     }
   };

   /**
    * TODO: Create an expect method that compares matrices directly.
    */
   var expectMatricesToEqual = function() {};
});