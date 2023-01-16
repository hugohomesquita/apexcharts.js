import Utils from '../../utils/Utils'
import Helpers from './Helpers'

export default class XAnnotations {
  constructor(annoCtx, xyRatios) {
    this.w = annoCtx.w
    this.annoCtx = annoCtx
    this.xyRatios = xyRatios

    this.invertAxis = this.annoCtx.invertAxis

    this.helpers = new Helpers(this.annoCtx)
    this.gridRect = this.w.globals.dom.baseEl.querySelector('.apexcharts-grid')
  }

  addXaxisAnnotation(anno, parent, index) {
    let w = this.w

    let x1 = this.helpers.getX1X2('x1', anno)
    let x2

    const text = anno.label.text

    let strokeDashArray = anno.strokeDashArray

    if (!Utils.isNumber(x1)) return

    if (anno.x2 === null || typeof anno.x2 === 'undefined') {
      let line = this.annoCtx.graphics.drawLine(
        x1 + anno.offsetX, // x1
        0 + anno.offsetY, // y1
        x1 + anno.offsetX, // x2
        w.globals.gridHeight + anno.offsetY, // y2
        anno.borderColor, // lineColor
        strokeDashArray, //dashArray
        anno.borderWidth
      )
      parent.appendChild(line.node)
      if (anno.id) {
        line.node.classList.add(anno.id)
      }
    } else {
      x2 = this.helpers.getX1X2('x2', anno)

      if (x2 < x1) {
        let temp = x1
        x1 = x2
        x2 = temp
      }

      let rect = this.annoCtx.graphics.drawRect(
        x1 + anno.offsetX, // x1
        0 + anno.offsetY, // y1
        x2 - x1, // x2
        w.globals.gridHeight + anno.offsetY, // y2
        0, // radius
        anno.fillColor, // color
        anno.opacity, // opacity,
        1, // strokeWidth
        anno.borderColor, // strokeColor
        strokeDashArray // stokeDashArray
      )
      rect.node.classList.add('apexcharts-annotation-rect')
      rect.attr('clip-path', `url(#gridRectMask${w.globals.cuid})`)
      parent.appendChild(rect.node)
      if (anno.id) {
        rect.node.classList.add(anno.id)
      }
      if (anno.click) {
        rect.node.addEventListener('click', anno.click.bind(this, anno))
      }
      if (anno.selection) {
        let minX1 = 0
        let maxX1 = w.globals.gridWidth

        this.w.config.annotations.xaxis.forEach(a => {
          if(a.id != anno.id){
            if(a.x < anno.x){
              const aX2 = this.helpers.getX1X2('x2', a)
              minX1 = Math.max(minX1, aX2)
            }
            if(a.x2 > anno.x2){
              const aX1 = this.helpers.getX1X2('x1', a)
              maxX1 = Math.min(maxX1, aX1)
            }
          }
        })

        rect
          .draggable({
            minX: minX1,
            minY: 0,
            maxX: maxX1,
            maxY: w.globals.gridHeight
          })
          .selectize({
            points: 'l, r',
            pointSize: 8,
            pointType: 'rect'
          })
          .resize({
            constraint: {
              minX: minX1,
              minY: 0,
              maxX: maxX1,
              maxY: w.globals.gridHeight
            }
          })
          .on('resizedone', this.selectionDragging.bind(this, anno))
          .on('dragend', this.selectionDragging.bind(this, anno))
      }
    }

    let textRects = this.annoCtx.graphics.getTextRects(
      text,
      parseFloat(anno.label.style.fontSize)
    )
    let textY =
      anno.label.position === 'top'
        ? 4
        : anno.label.position === 'center'
        ? w.globals.gridHeight / 2 +
          (anno.label.orientation === 'vertical' ? textRects.width / 2 : 0)
        : w.globals.gridHeight

    let elText = this.annoCtx.graphics.drawText({
      x: x1 + anno.label.offsetX,
      y:
        textY +
        anno.label.offsetY -
        (anno.label.orientation === 'vertical'
          ? anno.label.position === 'top'
            ? textRects.width / 2 - 12
            : -textRects.width / 2
          : 0),
      text,
      textAnchor: anno.label.textAnchor,
      fontSize: anno.label.style.fontSize,
      fontFamily: anno.label.style.fontFamily,
      fontWeight: anno.label.style.fontWeight,
      foreColor: anno.label.style.color,
      cssClass: `apexcharts-xaxis-annotation-label ${
        anno.label.style.cssClass
      } ${anno.id ? anno.id : ''}`
    })

    elText.attr({
      rel: index
    })

    parent.appendChild(elText.node)

    // after placing the annotations on svg, set any vertically placed annotations
    this.annoCtx.helpers.setOrientations(anno, index)
  }

  drawXAxisAnnotations() {
    let w = this.w

    let elg = this.annoCtx.graphics.group({
      class: 'apexcharts-xaxis-annotations'
    })

    w.config.annotations.xaxis.map((anno, index) => {
      this.addXaxisAnnotation(anno, elg.node, index)
    })

    return elg
  }

  selectionDragging(anno, e) {
    const xyRatios = this.xyRatios
    const gridRectDim = this.gridRect.getBoundingClientRect()
    const selectionRect = e.target.getBoundingClientRect()

    const minX =
      this.w.globals.xAxisScale.niceMin +
      (selectionRect.left - gridRectDim.left) * xyRatios.xRatio
    const maxX =
      this.w.globals.xAxisScale.niceMin +
      (selectionRect.right - gridRectDim.left) * xyRatios.xRatio

    anno.selection.bind(this, { minX, maxX })()
  }
}
