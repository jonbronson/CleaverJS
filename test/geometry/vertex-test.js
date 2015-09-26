var Vertex = require('../../js/geometry/vertex');

describe('Vertex Tests', function() {

  describe('Initialization', function() {
    it('should initialize to (0, 0) with no parameters', function() {
      var v = new Vertex();
      expect(v.pos.x).toBe(0);
      expect(v.pos.y).toBe(0);
    });
  });

});