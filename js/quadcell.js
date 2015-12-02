/**
 * @fileOverview This file defines the Cell class for the QuadTree
 * @author Jonathan Bronson</a>
 */
var Rect = require('./geometry/rect');

module.exports = (function(){

'use strict';

var _00 = 0;
var _01 = 1;
var _10 = 2;
var _11 = 3;

/**
 * Creates a new QuadTree Cell object
 * @class
 * @constructor
 * @alias QuadCell
 */
var QuadCell = function(bounds) {
  this.bounds = bounds;
  this.level = null;
  this.parent = null;
  this.children = [];
};

/**
 * Checksns true if this cell has children, false otherwise.
 * @returns {boolean}
 */
QuadCell.prototype.hasChildren = function() {
  return (this.children.length > 0);
};

/**
 * Subdivides the cell, creating 4 children cells.
 * @returns {boolean} true if successful, false otherwise
 */
QuadCell.prototype.subdivide = function() {
  if(this.level == 0)
    return false;

  for (var i=0; i < 4; i++) {
    var width = 0.5*this.bounds.width();
    var height = 0.5*this.bounds.height();
    var left = this.bounds.left + ((i & _01) >> 0)*width;
    var bottom = this.bounds.bottom + ((i & _10) >> 1)*height;
    var bounds = new Rect(left, bottom, left + width, bottom + height);
    var child = new QuadCell(bounds);
    child.level = this.level - 1;
    child.xLocCode = this.xLocCode | (((i & _01) >> 0) << child.level);
    child.yLocCode = this.yLocCode | (((i & _10) >> 1) << child.level);
    child.parent = this;

    this.children.push(child);
  }

  return true;
};

QuadCell.prototype.toSVG = function() {
  var rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
  rect.setAttribute('x', this.bounds.left);
  rect.setAttribute('y', this.bounds.bottom);
  rect.setAttribute('height', this.bounds.width());
  rect.setAttribute('width', this.bounds.height());
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', '#0000bb');
  rect.setAttribute('stroke-width', '0.1');
  var that = this;
  rect.onclick=function() { window.setCurrentCell(that);  };
  return rect;
};

QuadCell.prototype.splitSVG = function(rect) {
  this.subdivide();
  var svg = rect.parentElement;
  for (var i=0; i < this.children.length; i++) {
    if (this.children[i]) {
      svg.appendChild(this.children[i].toSVG());
    }
  }
}

return QuadCell;

}());
