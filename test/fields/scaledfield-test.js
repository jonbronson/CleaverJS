var ScaledField = require('../../js/fields/scaledfield');
var CircleField = require('../../js/fields/circlefield');
var Rect = require('../../js/geometry/rect');

describe('ScaledField Tests', function() {

  describe('valueAt()', function() {
    it('should return the scaled value everywhere', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var circleField = new CircleField(48, 48, 30, bounds);
      var scaledField = new ScaledField(circleField, 2, bounds);

      expect(scaledField.valueAt(14, 91)).toBe(2*circleField.valueAt(14, 91));
      expect(scaledField.valueAt(82, 47)).toBe(2*circleField.valueAt(82, 47));
      expect(scaledField.valueAt(50, 11)).toBe(2*circleField.valueAt(50, 11));
    });
  });

});