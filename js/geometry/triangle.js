module.exports = (function(){ 

'use strict';

var Triangle = function(v1, v2, v3, material) {
  this.v1 = v1;
  this.v2 = v2;
  this.v3 = v3;
  this.material = material;

  if (!v1.faces)
    v1.faces = [];
  if (!v2.faces)
    v2.faces = [];
  if (!v3.faces)
    v3.faces = [];

  v1.faces.push(this);
  v2.faces.push(this);
  v3.faces.push(this);

  this.halfEdges = [];
};

Triangle.prototype.toSVG = function() {

  var path = document.createElementNS("http://www.w3.org/2000/svg","path"); 
  // path.setAttribute("id", this.id); 
  var pathString = ' M ' + this.v1.pos.x + ' ' + this.v1.pos.y +
                   ' L ' + this.v2.pos.x + ' ' + this.v2.pos.y + 
                   ' L ' + this.v3.pos.x + ' ' + this.v3.pos.y + 
                   ' L ' + this.v1.pos.x + ' ' + this.v1.pos.y;

  path.setAttribute("d", pathString);  
  path.setAttribute('stroke-width', '0.5')
  var stroke = 'black';
  var fill = '#FFFFFF';
  switch (this.material) {
    case 0:
      fill = '#cad7f2';   // '#bbFFFF';
      stroke = '#a0b0b0';  // '#007777';
      break;
    case 1:
      fill = '#fed8bc';    // '#FFbbbb';
      stroke = '#b0b0a0';  // '#770000';
      break;
    case 2:
      fill = '#bbFFbb';
      stroke = '#007700';
      break;
    case 3:
      fill = '#bbbbFF';
      stroke = '#000077';
      break;
    default:
      fill = '#ffffff';
      stroke = 'black';
      break;
  }
  path.setAttribute('fill', fill);   
  path.setAttribute('stroke', stroke);

  return path;
};

return Triangle;

}());
