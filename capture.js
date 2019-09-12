const CDP = require('chrome-remote-interface')
const fs = require('fs')
const sleep = require('sleep-promise')
const fetch = require('node-fetch')

// xml namespaces are stripped out by a sed rule in package.json
let xml = `<?xml version="1.0" encoding="utf-8"?>
<Include xmlns:xi="http://www.w3.org/2001/XInclude">
`

// set to false to test map generation
const captureEnabled = true
const d = 64

// fixme - gross hack offset, fix in capturing
const xOffset = -14 * 0.01
const yOffset = -5.5 * 0.01

let captures = []
let parcels = []

const findParcels = (x, z) => {
  let x1 = x - 8
  let z1 = z - 8
  let x2 = x + 8
  let z2 = z + 8

  let overlap = (a, b) => {
    return a.max >= b.min && a.min <= b.max
  }

  return parcels.filter(p => {
    return overlap({ min: p.x1, max: p.x2 }, { min: x1, max: x2 }) && overlap({ min: p.z1, max: p.z2 }, { min: z1, max: z2 })
  })
}

let total = 0

const generateCaptures = () => {
  let p = parcels.find(p => p.address === '1 Hash Gateway')
  console.log(JSON.stringify(p))

  for (let x = -d * 2; x < d * 2; x++) {
    for (let z = -d; z < d; z++) {
      total++

      const x1 = xOffset + -x * 16 * 0.01
      const y1 = yOffset + -z * 16 * 0.01
      const x2 = x1 + 16.2 * 0.01
      const y2 = y1 + 16.2 * 0.01

      let parcels = findParcels(-x * 16, -z * 16)

      if (parcels.length > 0) {
        captures.push({
          x, z, x1, y1, x2, y2, parcels
        })
      }
    }
  }

  console.log(`Capturing ${captures.length} tiles of ${total}...`)

  CDP((client) => {
    navigateWebsite(client)
  })
}

fetch('https://www.cryptovoxels.com/grid/parcels')
  .then(r => r.json())
  .then(r => {
    parcels = r.parcels
    generateCaptures()
  })

async function navigateWebsite (client) {
  const { Console, Log, DOM, Emulation, Network, Page, Runtime } = client

  try {
    if (captureEnabled) {
      await Page.enable()
      await DOM.enable()
      await Network.enable()

      Runtime.exceptionThrown((params) => {
        console.log('>', params)
      })
      Log.entryAdded(({entry}) => {
        console.log(entry)
      })
      Console.messageAdded(({entry}) => {
        console.log(entry)
      })

      await Page.navigate({url: 'https://www.cryptovoxels.com/play?mode=mapping'})
      await Page.loadEventFired()

      console.log('Waiting for the world to load...')
      await sleep(30000)

      console.log('Resuming capture...')
    }

    const deviceMetrics = {
      width: 512,
      height: 512,
      deviceScaleFactor: 1,
      mobile: false,
      fitWindow: false
    }
    await Emulation.setDeviceMetricsOverride(deviceMetrics)

    let current = 0

    total = captures.length

    while (captures.length > 0) {
      current++

      let capture = captures.pop()
      let { x, z, x1, y1, x2, y2, parcels } = capture

      console.log(`Capturing ${current} / ${total} - ${x},0,${z}...\n * ${parcels.map(p => p.address).join('\n * ')}`)

      if (captureEnabled) {
        // Move camera
        //   fixme: 7 is a gross hack
        await Runtime.evaluate({
          expression: `ortho(new BABYLON.Vector3(${x} * 16, ${z} * 16, 7))`
        })

        // Wait for render
        await sleep(50)

        // Take a screenshot
        const { data } = await Page.captureScreenshot({ timeout: 1000 })
        fs.writeFileSync(`./tiles/tile_${x}_0_${z}.png`, Buffer.from(data, 'base64'))
      }

      xml += `
        <Layer name="world" srs="+init=epsg:4326">
            <StyleName>style</StyleName>
            <Datasource>
                <Parameter name="file">tiles/tile_${x}_0_${z}.png</Parameter>
                <Parameter name="tile_size">512</Parameter>
                <Parameter name="type">raster</Parameter>
                <Parameter name="lox">${x1}</Parameter>
                <Parameter name="loy">${y1}</Parameter>
                <Parameter name="hix">${x2}</Parameter>
                <Parameter name="hiy">${y2}</Parameter>
            </Datasource>
        </Layer>
      `
    }

    xml += '</Include>'

    fs.writeFileSync('./map-tiles.xml', xml)

    // Close the browser
    if (captureEnabled) {
      // await browser.close()
    }

    process.exit()
  } catch (err) {
    console.log('ERROR!', err)
  }
}
