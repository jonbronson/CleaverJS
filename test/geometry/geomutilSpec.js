var GeomUtil = require('../../js/geometry/geomutil');
var Point = require('../../js/geometry/point');

console.dir(Point);

describe('GeomUtil Tests', function() {

  describe('computeLineIntersection()', function() {
    it('should interesct orthogonal unit vectors correctly', function() {
      var p1 = new Point(0.5, 0.5);
      /*

      var p2 = new Point(0.5,   1);
      var p3 = new Point(  0, 0.5);
      var p4 = new Point(  1, 0.5);
      */

      //var result = GeomUtil.computeLineIntersection(p1, p2, p3, p4);
      //expect(result.ua).toBe(0.5);
      //expect(result.ub).toBe(0.5);
    });
  });

});
