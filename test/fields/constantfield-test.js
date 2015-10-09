var ConstantField = require('../../js/fields/constantfield');
var Rect = require('../../js/geometry/rect');

describe('ConstantField Tests', function() {

  describe('valueAt()', function() {
    it('should return the same value everywhere', function() {
      var bounds = new Rect(0, 0, 100, 100);
      var field = new ConstantField(3, bounds);

      expect(field.valueAt(14, 91)).toBe(3);
      expect(field.valueAt(82, 47)).toBe(3);
      expect(field.valueAt(50, 11)).toBe(3);
    });
  });

});