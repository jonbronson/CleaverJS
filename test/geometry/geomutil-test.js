var GeomUtil = require('../../js/geometry/geomutil');
var Point = require('../../js/geometry/point');

describe('GeomUtil Tests', function() {

  describe('computeLineIntersection()', function() {
    it('should interesect orthogonal unit vectors correctly', function() {
      var p1 = new Point(0.5,   0);
      var p2 = new Point(0.5,   1);
      var p3 = new Point(  0, 0.5);
      var p4 = new Point(  1, 0.5);

      var result = GeomUtil.computeLineIntersection(p1, p2, p3, p4);
      expect(result.ua).toBe(0.5);
      expect(result.ub).toBe(0.5);
    });

    it('should handle parallel lines as intersections at infinity', function() {
      var p1 = new Point(1,0);
      var p2 = new Point(0,0);
      var p3 = new Point(0,1);
      var p4 = new Point(1,1);

      var result = GeomUtil.computeLineIntersection(p1, p2, p3, p4);
      expect(Math.abs(result.ua)).toBe(Number.POSITIVE_INFINITY);
      expect(Math.abs(result.ub)).toBe(Number.POSITIVE_INFINITY);
    });
  });

});
