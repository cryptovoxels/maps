var mapnik = require('mapnik')
var mercator = require('./utils/sphericalmercator')
var http = require('http')
var parseXYZ = require('./utils/tile.js').parseXYZ
var path = require('path')
var fs = require('fs')
var url = require('url')

var proj4 = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over'
var mercatorProjection = new mapnik.Projection(proj4)

const port = 8500

// register postgis plugin
if (mapnik.register_default_input_plugins) {
  mapnik.register_default_input_plugins()
}

// register fonts and datasource plugins
mapnik.register_default_fonts()
mapnik.register_default_input_plugins()
mapnik.registerFonts('fonts')

const requests = []
let request = null

var map = new mapnik.Map(256, 256, mercator.proj4)

map.load(path.join(__dirname, 'map.xml'), {strict: true}, (err, map) => {
  http.createServer((req, res) => {
    requests.push({ req, res })
    processRequest()
  }).listen(port)

  function processRequest () {
    if (!request && requests.length > 0) {
      request = requests.pop()
    } else {
      return
    }

    const { req, res } = request

    if (req.url === '/') {
      res.writeHead(200)
      res.end(fs.readFileSync('./preview.html'))
      request = null
      processRequest()
      return
    }

    console.log(req.url)
    console.log(req.url.match('/parcel'))

    if (req.url.match('/parcel')) {
      try {
        let query = url.parse(req.url, true).query
        let x = parseFloat(query.x)
        let y = parseFloat(query.y)
        let b = 0.2

        var bbox = mercatorProjection.forward([
          x - b, y - b, x + b, y + b
        ])

        map.bufferSize = 64
        map.extent = bbox

        var im = new mapnik.Image(map.width, map.height)
        map.render(im, (err, im) => {
          if (err) {
            throw err
          }

          res.writeHead(200, { 'Content-Type': 'image/png' })
          res.end(im.encodeSync('png'))
          request = null
          processRequest()
        })
      } catch (err) {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end(err.message)
        request = null
        processRequest()
      }

      return
    }

    parseXYZ(req, false, (err, params) => {
      if (err) {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end(err.message)
      }

      try {
        var bbox = mercator.xyz_to_envelope(
          parseInt(params.x),
          parseInt(params.y),
          parseInt(params.z),
          false
        )

        map.bufferSize = 64
        map.extent = bbox

        var im = new mapnik.Image(map.width, map.height)
        map.render(im, (err, im) => {
          if (err) {
            throw err
          }

          res.writeHead(200, { 'Content-Type': 'image/png' })
          res.end(im.encodeSync('png'))
          request = null
          processRequest()
        })
      } catch (err) {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end(err.message)
        request = null
        processRequest()
      }
    })
  }
})

console.log('Map server running on port %d', port)
