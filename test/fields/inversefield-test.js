var InverseField = require('../../js/fields/inversefield');
var CircleField = require('../../js/fields/circlefield');
var Rect = require('../../js/geometry/rect');

describe('InverseField Tests', function() {

  describe('valueAt()', function() {
    it('should return the negative of its base field', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var circleField = new CircleField(42, 63, 13, bounds);
      var inverseField = new InverseField(circleField, bounds);
      expect(inverseField.valueAt(14, 14)).toBe(
          -1 * circleField.valueAt(14, 14));
      expect(inverseField.valueAt(81, 52)).toBe(
          -1 * circleField.valueAt(81, 52));
    });
  });

});