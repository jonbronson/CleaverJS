var Vector = require('../js/geometry/vector');

describe('Vector Tests', function() {
 
  describe('ZERO()', function() {
    it('should initialize to (0, 0)', function() {
      var v = Vector.ZERO();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);    
    });
  });

  describe('Unit_X()', function() {
    it('should initialize to (1, 0)', function() {
      var v = Vector.UNIT_X();
      expect(v.x).toBe(1);
      expect(v.y).toBe(0);    
    });
  });

  describe('Unit_Y()', function() {
    it('should initialize to (0, 1)', function() {
      var v = Vector.UNIT_Y();
      expect(v.x).toBe(0);
      expect(v.y).toBe(1);    
    });
  });

  describe('toString()', function() {
    it('should return a readable string version of the vector', function() {
      var v = new Vector(1.2, 3.45);
      var string = v.toString();
      expect(string).toBe('[1.2, 3.45]');
    });
  })

  describe('dot()', function() {
    it('should perform a dot product (scalar/inner product) successfully', function() {
      var x = new Vector(1.2, 3.4);
      var y = new Vector(2.1, 4.3);
      var result = x.dot(y);
      var expected = 1.2*2.1 + 3.4*4.3;
      expect(result).toBe(expected);
    });
  });

  describe('cross()', function() {
    it('should compute the cross product (exterior product) with a 2nd vector', function() {
      var x = new Vector(1.0, 0.0);
      var y = new Vector(0.0, 1.0);
      var result = x.cross(y);
      expect(result).toBe(1.0);
    });
    it('should return negative values for reversed cross products', function() {
      var x = new Vector(1.0, 0.0);
      var y = new Vector(0.0, 1.0);
      var result = y.cross(x);
      expect(result).toBe(-1);
    });
  });

  describe('createPerpendicular()', function() {
    it('should return a vector perpendicular to the input', function() {
      var x = new Vector(1.2, 3.4);
      var y = x.createPerpendicular();
      expect(x.dot(y)).toBe(0);
    });
  }); 

  describe('plus()', function() {
    it('should return the sum of the two vectors', function() {
      var x = new Vector(1.2, 3.4);
      var y = new Vector(5.6, 7.8);
      var sum = x.plus(y);
      var expected = new Vector(6.8, 11.2);
      expect(sum).toEqual(expected);
    });
  });

  describe('minus()', function() {
    it('should return the difference of the two vectors', function() {
      var x = new Vector(1.2, 3.45);
      var y = new Vector(6.7, 8.90);
      var difference = y.minus(x);
      var expected = new Vector(5.5, 5.45);      
      expect(difference).toEqual(expected);
    });
  });

  describe('length()', function() {
    it('method should return length of 1 for unit vectors', function() {
      var unit_x = Vector.UNIT_X();
      var unit_y = Vector.UNIT_Y();

      expect(unit_x.length()).toEqual(1);
      expect(unit_y.length()).toEqual(1);
    });
  })
});