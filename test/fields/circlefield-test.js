var CircleField = require('../../js/fields/circlefield');
var Rect = require('../../js/geometry/rect');

describe('CircleField Tests', function() {

  describe('valueAt()', function() {
    it('should return radius at circle center', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var field = new CircleField(42, 63, 13, bounds);
      expect(field.valueAt(42, 63)).toBe(13);
    });

    it('should return zero on the boundary', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var field = new CircleField(42, 63, 13, bounds);
      expect(field.valueAt(29, 63)).toBe(0);
      expect(field.valueAt(55, 63)).toBe(0);
      expect(field.valueAt(42, 50)).toBe(0);
      expect(field.valueAt(42, 76)).toBe(0);
      expect(field.valueAt(51.192388,
                           72.192388)).toBeCloseTo(0, 6);
    });

    it('should return negative outside the circle', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var field = new CircleField(42, 63, 13, bounds);
      expect(field.valueAt(5, 5)).toBeLessThan(0);

    });
  });

});