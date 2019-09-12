var mapnik = require('mapnik')
var mercator = require('./utils/sphericalmercator')
var http = require('http')
var parseXYZ = require('./utils/tile.js').parseXYZ
var path = require('path')

const port = 8500

// register postgis plugin
if (mapnik.register_default_input_plugins) {
  mapnik.register_default_input_plugins()
}

// register fonts and datasource plugins
mapnik.register_default_fonts()
mapnik.register_default_input_plugins()
mapnik.registerFonts('fonts')

http.createServer((req, res) => {
  parseXYZ(req, false, (err, params) => {
    if (err) {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      res.end(err.message)
    }

    try {
      var map = new mapnik.Map(256, 256, mercator.proj4)
      var bbox = mercator.xyz_to_envelope(
        parseInt(params.x),
        parseInt(params.y),
        parseInt(params.z),
        false
      )

      map.bufferSize = 64
      map.load(path.join(__dirname, 'map.xml'), {strict: true}, (err, map) => {
        if (err) {
          throw err
        }

        map.extent = bbox

        var im = new mapnik.Image(map.width, map.height)
        map.render(im, (err, im) => {
          if (err) {
            throw err
          }

          res.writeHead(200, { 'Content-Type': 'image/png' })
          res.end(im.encodeSync('png'))
        })
      })
    } catch (err) {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      res.end(err.message)
    }
  })
}).listen(port)

console.log('Map server running on port %d', port)
