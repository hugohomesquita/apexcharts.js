import Graphics from './Graphics'
import Utils from './../utils/Utils'
import Toolbar from './Toolbar'

/**
 * ApexCharts Zoom Class for handling zooming and panning on axes based charts.
 *
 * @module ZoomPanSelection
 **/

export default class ZoomPanSelection extends Toolbar {
  constructor(ctx) {
    super(ctx)

    this.ctx = ctx
    this.w = ctx.w

    this.dragged = false
    this.graphics = new Graphics(this.ctx)

    this.eventList = [
      'mousedown',
      'mouseleave',
      'mousemove',
      'touchstart',
      'touchmove',
      'mouseup',
      'touchend',
      'wheel',
    ]

    this.clientX = 0
    this.clientY = 0
    this.startX = 0
    this.endX = 0
    this.dragX = 0
    this.startY = 0
    this.endY = 0
    this.dragY = 0
    this.moveDirection = 'none'

    this.debounceTimer = null
    this.debounceDelay = 100
    this.wheelDelay = 400
  }

  init({ xyRatios }) {
    let w = this.w
    let me = this

    this.xyRatios = xyRatios

    this.zoomRect = this.graphics.drawRect(0, 0, 0, 0)
    this.selectionRect = this.graphics.drawRect(0, 0, 0, 0)

    this.gridRect = w.globals.dom.baseEl.querySelector('.apexcharts-grid')

    this.zoomRect.node.classList.add('apexcharts-zoom-rect')
    this.selectionRect.node.classList.add('apexcharts-selection-rect')
    w.globals.dom.Paper.add(this.zoomRect)
    w.globals.dom.Paper.add(this.selectionRect)

    if (w.config.chart.selection.type === 'x') {
      this.slDraggableRect = this.selectionRect
        .draggable({
          minX: 0,
          minY: 0,
          maxX: w.globals.gridWidth,
          maxY: w.globals.gridHeight,
        })
        .on('dragmove', this.selectionDragging.bind(this, 'dragging'))
    } else if (w.config.chart.selection.type === 'y') {
      this.slDraggableRect = this.selectionRect
        .draggable({
          minX: 0,
          maxX: w.globals.gridWidth,
        })
        .on('dragmove', this.selectionDragging.bind(this, 'dragging'))
    } else {
      this.slDraggableRect = this.selectionRect
        .draggable()
        .on('dragmove', this.selectionDragging.bind(this, 'dragging'))
    }
    this.preselectedSelection()

    this.hoverArea = w.globals.dom.baseEl.querySelector(
      `${w.globals.chartClass} .apexcharts-svg`
    )
    this.hoverArea.classList.add('apexcharts-zoomable')

    this.eventList.forEach((event) => {
      this.hoverArea.addEventListener(
        event,
        me.svgMouseEvents.bind(me, xyRatios),
        {
          capture: false,
          passive: true,
        }
      )
    })

    if (
      w.config.chart.zoom.enabled &&
      w.config.chart.zoom.allowMouseWheelZoom
    ) {
      this.hoverArea.addEventListener('wheel', me.mouseWheelEvent.bind(me), {
        capture: false,
        passive: false,
      })
    }
  }

  // remove the event listeners which were previously added on hover area
  destroy() {
    if (this.slDraggableRect) {
      this.slDraggableRect.draggable(false)
      this.slDraggableRect.off()
      this.selectionRect.off()
    }

    this.selectionRect = null
    this.zoomRect = null
    this.gridRect = null
  }

  svgMouseEvents(xyRatios, e) {
    let w = this.w
    const toolbar = this.ctx.toolbar

    let zoomtype = w.globals.zoomEnabled
      ? w.config.chart.zoom.type
      : w.config.chart.selection.type

    const autoSelected = w.config.chart.toolbar.autoSelected

    if (e.shiftKey) {
      this.shiftWasPressed = true
      toolbar.enableZoomPanFromToolbar(autoSelected === 'pan' ? 'zoom' : 'pan')
    } else {
      if (this.shiftWasPressed) {
        toolbar.enableZoomPanFromToolbar(autoSelected)
        this.shiftWasPressed = false
      }
    }

    if (!e.target) return

    const tc = e.target.classList
    let pc
    if (e.target.parentNode && e.target.parentNode !== null) {
      pc = e.target.parentNode.classList
    }
    const falsePositives =
      tc.contains('apexcharts-legend-marker') ||
      tc.contains('apexcharts-legend-text') ||
      (pc && pc.contains('apexcharts-toolbar'))

    if (falsePositives) return

    this.clientX =
      e.type === 'touchmove' || e.type === 'touchstart'
        ? e.touches[0].clientX
        : e.type === 'touchend'
          ? e.changedTouches[0].clientX
          : e.clientX
    this.clientY =
      e.type === 'touchmove' || e.type === 'touchstart'
        ? e.touches[0].clientY
        : e.type === 'touchend'
          ? e.changedTouches[0].clientY
          : e.clientY

    if ((e.type === 'mousedown' && e.which === 1) || e.type === 'touchstart') {
      let gridRectDim = this.gridRect.getBoundingClientRect()

      this.startX =
        this.clientX - gridRectDim.left - w.globals.barPadForNumericAxis
      this.startY = this.clientY - gridRectDim.top

      this.dragged = false
      this.w.globals.mousedown = true
    }

    if ((e.type === 'mousemove' && e.which === 1) || e.type === 'touchmove') {
      this.dragged = true

      if (w.globals.panEnabled) {
        w.globals.selection = null
        if (this.w.globals.mousedown) {
          this.panDragging({
            context: this,
            zoomtype,
            xyRatios,
          })
        }
      } else {
        if (
          (this.w.globals.mousedown && w.globals.zoomEnabled) ||
          (this.w.globals.mousedown && w.globals.selectionEnabled)
        ) {
          this.selection = this.selectionDrawing({
            context: this,
            zoomtype,
          })
        }
      }
    }

    if (
      e.type === 'mouseup' ||
      e.type === 'touchend' ||
      e.type === 'mouseleave'
    ) {
      this.handleMouseUp({ zoomtype })
    }

    this.makeSelectionRectDraggable()
  }

  handleMouseUp({ zoomtype, isResized }) {
    const w = this.w
    // we will be calling getBoundingClientRect on each mousedown/mousemove/mouseup
    let gridRectDim = this.gridRect.getBoundingClientRect()

    if (gridRectDim && (this.w.globals.mousedown || isResized)) {
      // user released the drag, now do all the calculations
      this.endX =
        this.clientX - gridRectDim.left - w.globals.barPadForNumericAxis
      this.endY = this.clientY - gridRectDim.top
      this.dragX = Math.abs(this.endX - this.startX)
      this.dragY = Math.abs(this.endY - this.startY)

      if (w.globals.zoomEnabled || w.globals.selectionEnabled) {
        this.selectionDrawn({
          context: this,
          zoomtype,
        })
      }

      // if (w.globals.panEnabled && w.config.xaxis.convertedCatToNumeric) {
      //   this.delayedPanScrolled()
      // }
    }

    if (w.globals.zoomEnabled) {
      this.hideSelectionRect(this.selectionRect)
    }

    this.dragged = false
    this.w.globals.mousedown = false
  }

  mouseWheelEvent(e) {
    const w = this.w
    e.preventDefault()

    const now = Date.now()

    // Execute immediately if it's the first action or enough time has passed
    if (now - w.globals.lastWheelExecution > this.wheelDelay) {
      this.executeMouseWheelZoom(e)
      w.globals.lastWheelExecution = now
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (now - w.globals.lastWheelExecution > this.wheelDelay) {
        this.executeMouseWheelZoom(e)
        w.globals.lastWheelExecution = now
      }
    }, this.debounceDelay)
  }

  executeMouseWheelZoom(e) {
    const w = this.w
    this.minX = w.globals.isRangeBar ? w.globals.minY : w.globals.minX
    this.maxX = w.globals.isRangeBar ? w.globals.maxY : w.globals.maxX

    // Calculate the relative position of the mouse on the chart
    const gridRectDim = this.gridRect.getBoundingClientRect()
    if (!gridRectDim) return

    const mouseX = (e.clientX - gridRectDim.left) / gridRectDim.width

    const currentMinX = this.minX
    const currentMaxX = this.maxX
    const totalX = currentMaxX - currentMinX

    // Determine zoom factor
    const zoomFactorIn = 0.5
    const zoomFactorOut = 1.5
    let zoomRange

    let newMinX, newMaxX
    if (e.deltaY < 0) {
      // Zoom In
      zoomRange = zoomFactorIn * totalX
      const midPoint = currentMinX + mouseX * totalX
      newMinX = midPoint - zoomRange / 2
      newMaxX = midPoint + zoomRange / 2
    } else {
      // Zoom Out
      zoomRange = zoomFactorOut * totalX
      newMinX = currentMinX - zoomRange / 2
      newMaxX = currentMaxX + zoomRange / 2
    }

    // Constrain within original chart bounds
    if (!w.globals.isRangeBar) {
      newMinX = Math.max(newMinX, w.globals.initialMinX)
      newMaxX = Math.min(newMaxX, w.globals.initialMaxX)

      // Ensure minimum range
      const minRange = (w.globals.initialMaxX - w.globals.initialMinX) * 0.01
      if (newMaxX - newMinX < minRange) {
        const midPoint = (newMinX + newMaxX) / 2
        newMinX = midPoint - minRange / 2
        newMaxX = midPoint + minRange / 2
      }
    }

    const newMinXMaxX = this._getNewMinXMaxX(newMinX, newMaxX)

    // Apply zoom if valid
    if (!isNaN(newMinXMaxX.minX) && !isNaN(newMinXMaxX.maxX)) {
      this.zoomUpdateOptions(newMinXMaxX.minX, newMinXMaxX.maxX)
    }
  }

  makeSelectionRectDraggable() {
    const w = this.w

    if (!this.selectionRect) return

    const rectDim = this.selectionRect.node.getBoundingClientRect()
    if (rectDim.width > 0 && rectDim.height > 0) {
      this.slDraggableRect
        .selectize({
          points: 'l, r',
          pointSize: 8,
          pointType: 'rect'
        })
        .resize({
          constraint: {
            minX: 0,
            minY: 0,
            maxX: w.globals.gridWidth,
            maxY: w.globals.gridHeight
          }
        })
        .on('resizing', this.selectionDragging.bind(this, 'resizing'))
    }
  }

  preselectedSelection() {
    const w = this.w
    const xyRatios = this.xyRatios

    if (!w.globals.zoomEnabled) {
      if (
        typeof w.globals.selection !== 'undefined' &&
        w.globals.selection !== null
      ) {
        this.drawSelectionRect({
          ...w.globals.selection,
          translateX: w.globals.translateX,
          translateY: w.globals.translateY,
        })
      } else {
        if (
          w.config.chart.selection.xaxis.min !== undefined &&
          w.config.chart.selection.xaxis.max !== undefined
        ) {
          let x =
            (w.config.chart.selection.xaxis.min - w.globals.minX) /
            xyRatios.xRatio
          let width =
            w.globals.gridWidth -
            (w.globals.maxX - w.config.chart.selection.xaxis.max) /
            xyRatios.xRatio -
            x
          if (w.globals.isRangeBar) {
            // rangebars put datetime data in y axis
            x =
              (w.config.chart.selection.xaxis.min -
                w.globals.yAxisScale[0].niceMin) /
              xyRatios.invertedYRatio
            width =
              (w.config.chart.selection.xaxis.max -
                w.config.chart.selection.xaxis.min) /
              xyRatios.invertedYRatio
          }
          let selectionRect = {
            x,
            y: 0,
            width,
            height: w.globals.gridHeight,
            translateX: w.globals.translateX,
            translateY: w.globals.translateY,
            selectionEnabled: true,
          }
          this.drawSelectionRect(selectionRect)
          this.makeSelectionRectDraggable()
          if (typeof w.config.chart.events.selection === 'function') {
            w.config.chart.events.selection(this.ctx, {
              xaxis: {
                min: w.config.chart.selection.xaxis.min,
                max: w.config.chart.selection.xaxis.max,
              },
              yaxis: {},
            })
          }
        }
      }
    }
  }

  drawSelectionRect({ x, y, width, height, translateX = 0, translateY = 0 }) {
    const w = this.w
    const zoomRect = this.zoomRect
    const selectionRect = this.selectionRect
    if (this.dragged || w.globals.selection !== null) {
      let scalingAttrs = {
        transform: 'translate(' + translateX + ', ' + translateY + ')',
      }

      // change styles based on zoom or selection
      // zoom is Enabled and user has dragged, so draw blue rect
      if (w.globals.zoomEnabled && this.dragged) {
        if (width < 0) width = 1 // fixes apexcharts.js#1168
        zoomRect.attr({
          x,
          y,
          width,
          height,
          fill: w.config.chart.zoom.zoomedArea.fill.color,
          'fill-opacity': w.config.chart.zoom.zoomedArea.fill.opacity,
          stroke: w.config.chart.zoom.zoomedArea.stroke.color,
          'stroke-width': w.config.chart.zoom.zoomedArea.stroke.width,
          'stroke-opacity': w.config.chart.zoom.zoomedArea.stroke.opacity,
        })
        Graphics.setAttrs(zoomRect.node, scalingAttrs)
      }

      // selection is enabled
      if (w.globals.selectionEnabled) {
        selectionRect.attr({
          x,
          y,
          width: width > 0 ? width : 0,
          height: height > 0 ? height : 0,
          fill: w.config.chart.selection.fill.color,
          'fill-opacity': w.config.chart.selection.fill.opacity,
          stroke: w.config.chart.selection.stroke.color,
          'stroke-width': w.config.chart.selection.stroke.width,
          'stroke-dasharray': w.config.chart.selection.stroke.dashArray,
          'stroke-opacity': w.config.chart.selection.stroke.opacity,
        })

        Graphics.setAttrs(selectionRect.node, scalingAttrs)
      }
    }
  }

  hideSelectionRect(rect) {
    if (rect) {
      rect.attr({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      })
    }
  }

  selectionDrawing({ context, zoomtype }) {
    const w = this.w
    let me = context

    let gridRectDim = this.gridRect.getBoundingClientRect()

    let startX = me.startX - 1
    let startY = me.startY
    let inversedX = false
    let inversedY = false

    const left = me.clientX - gridRectDim.left - w.globals.barPadForNumericAxis
    const top = me.clientY - gridRectDim.top

    let selectionWidth = left - startX
    let selectionHeight = top - startY

    let selectionRect = {
      translateX: w.globals.translateX,
      translateY: w.globals.translateY,
    }

    if (Math.abs(selectionWidth + startX) > w.globals.gridWidth) {
      // user dragged the mouse outside drawing area to the right
      selectionWidth = w.globals.gridWidth - startX
    } else if (left < 0) {
      // user dragged the mouse outside drawing area to the left
      selectionWidth = startX
    }

    // inverse selection X
    if (startX > left) {
      inversedX = true
      selectionWidth = Math.abs(selectionWidth)
    }

    // inverse selection Y
    if (startY > top) {
      inversedY = true
      selectionHeight = Math.abs(selectionHeight)
    }

    if (zoomtype === 'x') {
      selectionRect = {
        x: inversedX ? startX - selectionWidth : startX,
        y: 0,
        width: selectionWidth,
        height: w.globals.gridHeight,
      }
    } else if (zoomtype === 'y') {
      selectionRect = {
        x: 0,
        y: inversedY ? startY - selectionHeight : startY,
        width: w.globals.gridWidth,
        height: selectionHeight,
      }
    } else {
      selectionRect = {
        x: inversedX ? startX - selectionWidth : startX,
        y: inversedY ? startY - selectionHeight : startY,
        width: selectionWidth,
        height: selectionHeight,
      }
    }

    selectionRect = {
      ...selectionRect,
      translateX: w.globals.translateX,
      translateY: w.globals.translateY,
    }

    me.drawSelectionRect(selectionRect)
    me.selectionDragging('resizing')
    return selectionRect
  }

  selectionDragging(type, e) {
    const w = this.w
    if (!e) return

    e.preventDefault()

    // const { handler, box } = e.detail
    //
    // let { x, y } = box
    //
    // if (x < this.constraints.x) {
    //   x = this.constraints.x
    // }
    //
    // if (y < this.constraints.y) {
    //   y = this.constraints.y
    // }
    //
    // if (box.x2 > this.constraints.x2) {
    //   x = this.constraints.x2 - box.w
    // }
    //
    // if (box.y2 > this.constraints.y2) {
    //   y = this.constraints.y2 - box.h
    // }
    //
    // handler.move(x, y)

    const xyRatios = this.xyRatios

    const selRect = this.selectionRect

    let timerInterval = 0

    if (type === 'resizing') {
      timerInterval = 30
    }

    // update selection when selection rect is dragged
    const getSelAttr = (attr) => {
      return parseFloat(selRect.node.getAttribute(attr))
    }
    const draggedProps = {
      x: getSelAttr('x'),
      y: getSelAttr('y'),
      width: getSelAttr('width'),
      height: getSelAttr('height'),
    }

    w.globals.selection = draggedProps
    // update selection ends

    if (
      typeof w.config.chart.events.selection === 'function' &&
      w.globals.selectionEnabled
    ) {
      // a small debouncer is required when resizing to avoid freezing the chart
      clearTimeout(this.w.globals.selectionResizeTimer)
      this.w.globals.selectionResizeTimer = window.setTimeout(() => {
        const gridRectDim = this.gridRect.getBoundingClientRect()
        const selectionRect = selRect.node.getBoundingClientRect()

        let minX, maxX, minY, maxY

        if (!w.globals.isRangeBar) {
          // normal XY charts
          minX =
            w.globals.xAxisScale.niceMin +
            (selectionRect.left - gridRectDim.left) * xyRatios.xRatio
          maxX =
            w.globals.xAxisScale.niceMin +
            (selectionRect.right - gridRectDim.left) * xyRatios.xRatio

          minY =
            w.globals.yAxisScale[0].niceMin +
            (gridRectDim.bottom - selectionRect.bottom) * xyRatios.yRatio[0]
          maxY =
            w.globals.yAxisScale[0].niceMax -
            (selectionRect.top - gridRectDim.top) * xyRatios.yRatio[0]
        } else {
          // rangeBars use y for datetime
          minX =
            w.globals.yAxisScale[0].niceMin +
            (selectionRect.left - gridRectDim.left) * xyRatios.invertedYRatio
          maxX =
            w.globals.yAxisScale[0].niceMin +
            (selectionRect.right - gridRectDim.left) * xyRatios.invertedYRatio

          minY = 0
          maxY = 1
        }

        const xyAxis = {
          xaxis: {
            min: minX,
            max: maxX,
          },
          yaxis: {
            min: minY,
            max: maxY,
          },
        }
        w.config.chart.events.selection(this.ctx, xyAxis)

        if (
          w.config.chart.brush.enabled &&
          w.config.chart.events.brushScrolled !== undefined
        ) {
          w.config.chart.events.brushScrolled(this.ctx, xyAxis)
        }
      }, timerInterval)
    }
  }

  selectionDrawn({ context, zoomtype }) {
    const w = this.w
    const me = context
    const xyRatios = this.xyRatios
    const toolbar = this.ctx.toolbar

    // Use boundingRect for final selection area
    const selRect = w.globals.zoomEnabled
      ? me.zoomRect.node.getBoundingClientRect()
      : me.selectionRect.node.getBoundingClientRect()
    const gridRectDim = me.gridRect.getBoundingClientRect()

    // Local coords in the chart's grid
    const localStartX =
      selRect.left - gridRectDim.left - w.globals.barPadForNumericAxis
    const localEndX =
      selRect.right - gridRectDim.left - w.globals.barPadForNumericAxis
    const localStartY = selRect.top - gridRectDim.top
    const localEndY = selRect.bottom - gridRectDim.top

    // Convert those local coords to actual data values
    let xLowestValue, xHighestValue

    if (!w.globals.isRangeBar) {
      xLowestValue =
        w.globals.xAxisScale.niceMin + localStartX * xyRatios.xRatio
      xHighestValue = w.globals.xAxisScale.niceMin + localEndX * xyRatios.xRatio
    } else {
      xLowestValue =
        w.globals.yAxisScale[0].niceMin + localStartX * xyRatios.invertedYRatio
      xHighestValue =
        w.globals.yAxisScale[0].niceMin + localEndX * xyRatios.invertedYRatio
    }

    // For Y values, pick from the first y-axis, but handle multi-axis
    let yHighestValue = []
    let yLowestValue = []

    w.config.yaxis.forEach((yaxe, index) => {
      yHighestValue.push(
        w.globals.yAxisScale[index].niceMax - xyRatios.yRatio[index] * me.startY
      )
      yLowestValue.push(
        w.globals.yAxisScale[index].niceMax - xyRatios.yRatio[index] * me.endY
      )
    })

    // Only apply if user actually dragged far enough to consider it a selection
    if (
      me.dragged &&
      (me.dragX > 10 || me.dragY > 10) &&
      xLowestValue !== xHighestValue
    ) {
      if (w.globals.zoomEnabled) {
        let yaxis = Utils.clone(w.globals.initialConfig.yaxis)
        let xaxis = Utils.clone(w.globals.initialConfig.xaxis)

        w.globals.zoomed = true

        if (w.config.xaxis.convertedCatToNumeric) {
          xLowestValue = Math.floor(xLowestValue)
          xHighestValue = Math.floor(xHighestValue)

          if (xLowestValue < 1) {
            xLowestValue = 1
            xHighestValue = w.globals.dataPoints
          }

          if (xHighestValue - xLowestValue < 2) {
            xHighestValue = xLowestValue + 1
          }
        }

        if (zoomtype === 'xy' || zoomtype === 'x') {
          xaxis = {
            min: xLowestValue,
            max: xHighestValue,
          }
        }

        if (zoomtype === 'xy' || zoomtype === 'y') {
          yaxis.forEach((yaxe, index) => {
            yaxis[index].min = yLowestValue[index]
            yaxis[index].max = yHighestValue[index]
          })
        }

        if (toolbar) {
          let beforeZoomRange = toolbar.getBeforeZoomRange(xaxis, yaxis)
          if (beforeZoomRange) {
            xaxis = beforeZoomRange.xaxis ? beforeZoomRange.xaxis : xaxis
            yaxis = beforeZoomRange.yaxis ? beforeZoomRange.yaxis : yaxis
          }
        }

        let options = {
          xaxis,
        }

        if (!w.config.chart.group) {
          // if chart in a group, prevent yaxis update here
          // fix issue #650
          options.yaxis = yaxis
        }
        me.ctx.updateHelpers._updateOptions(
          options,
          false,
          me.w.config.chart.animations.dynamicAnimation.enabled
        )

        if (typeof w.config.chart.events.zoomed === 'function') {
          toolbar.zoomCallback(xaxis, yaxis)
        }
      } else if (w.globals.selectionEnabled) {
        let yaxis = null
        let xaxis = null
        xaxis = {
          min: xLowestValue,
          max: xHighestValue,
        }
        if (zoomtype === 'xy' || zoomtype === 'y') {
          yaxis = Utils.clone(w.config.yaxis)
          yaxis.forEach((yaxe, index) => {
            yaxis[index].min = yLowestValue[index]
            yaxis[index].max = yHighestValue[index]
          })
        }

        w.globals.selection = me.selection
        if (typeof w.config.chart.events.selection === 'function') {
          w.config.chart.events.selection(me.ctx, {
            xaxis,
            yaxis,
          })
        }
      }
    }
  }

  panDragging({ context }) {
    const w = this.w
    let me = context

    // check to make sure there is data to compare against
    if (typeof w.globals.lastClientPosition.x !== 'undefined') {
      // get the change from last position to this position
      const deltaX = w.globals.lastClientPosition.x - me.clientX
      const deltaY = w.globals.lastClientPosition.y - me.clientY

      // check which direction had the highest amplitude
      if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
        this.moveDirection = 'left'
      } else if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0) {
        this.moveDirection = 'right'
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        this.moveDirection = 'up'
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < 0) {
        this.moveDirection = 'down'
      }
    }

    // set the new last position to the current for next time (to get the position of drag)
    w.globals.lastClientPosition = {
      x: me.clientX,
      y: me.clientY,
    }

    let xLowestValue = w.globals.isRangeBar ? w.globals.minY : w.globals.minX

    let xHighestValue = w.globals.isRangeBar ? w.globals.maxY : w.globals.maxX

    // removed delayedPanScrolled as it doesn't seem to cause bugs anymore in convertedCatToNumeric
    // if (!w.config.xaxis.convertedCatToNumeric) {
    me.panScrolled(xLowestValue, xHighestValue)
    // }
  }

  // delayedPanScrolled() {
  //   const w = this.w

  //   let newMinX = w.globals.minX
  //   let newMaxX = w.globals.maxX
  //   const centerX = (w.globals.maxX - w.globals.minX) / 2

  //   if (this.moveDirection === 'left') {
  //     newMinX = w.globals.minX + centerX
  //     newMaxX = w.globals.maxX + centerX
  //   } else if (this.moveDirection === 'right') {
  //     newMinX = w.globals.minX - centerX
  //     newMaxX = w.globals.maxX - centerX
  //   }

  //   newMinX = Math.floor(newMinX)
  //   newMaxX = Math.floor(newMaxX)
  //   this.updateScrolledChart(
  //     { xaxis: { min: newMinX, max: newMaxX } },
  //     newMinX,
  //     newMaxX
  //   )
  // }

  panScrolled(xLowestValue, xHighestValue) {
    const w = this.w

    const xyRatios = this.xyRatios
    let yaxis = Utils.clone(w.globals.initialConfig.yaxis)

    let xRatio = xyRatios.xRatio
    let minX = w.globals.minX
    let maxX = w.globals.maxX
    if (w.globals.isRangeBar) {
      xRatio = xyRatios.invertedYRatio
      minX = w.globals.minY
      maxX = w.globals.maxY
    }

    if (this.moveDirection === 'left') {
      xLowestValue = minX + (w.globals.gridWidth / 15) * xRatio
      xHighestValue = maxX + (w.globals.gridWidth / 15) * xRatio
    } else if (this.moveDirection === 'right') {
      xLowestValue = minX - (w.globals.gridWidth / 15) * xRatio
      xHighestValue = maxX - (w.globals.gridWidth / 15) * xRatio
    }

    if (!w.globals.isRangeBar) {
      if (
        xLowestValue < w.globals.initialMinX ||
        xHighestValue > w.globals.initialMaxX
      ) {
        xLowestValue = minX
        xHighestValue = maxX
      }
    }

    let xaxis = {
      min: xLowestValue,
      max: xHighestValue,
    }

    let options = {
      xaxis,
    }

    if (!w.config.chart.group) {
      // if chart in a group, prevent yaxis update here
      // fix issue #650
      options.yaxis = yaxis
    }

    this.updateScrolledChart(options, xLowestValue, xHighestValue)
  }

  updateScrolledChart(options, xLowestValue, xHighestValue) {
    const w = this.w

    this.ctx.updateHelpers._updateOptions(options, false, false)

    if (typeof w.config.chart.events.scrolled === 'function') {
      const args = {
        xaxis: {
          min: xLowestValue,
          max: xHighestValue,
        },
      }
      w.config.chart.events.scrolled(this.ctx, args)
      this.ctx.events.fireEvent('scrolled', args)
    }
  }
}
