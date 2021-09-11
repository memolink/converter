const stream = require('stream')
const express = require('express')
const ffmpeg = require('fluent-ffmpeg')
const { createWriteStream } = require('fs')
const fs = require('fs/promises')
const sharp = require('sharp')
const ip = require('ip')
const uuid = require('uuid')
const createError = require('http-errors')
let key

const app = express()

// HH:MM:SS.ms => ms
function durationToMs(duration) {
	const a = duration.split(':')
	const seconds = +a[0] * 60 * 60 + +a[1] * 60 + +a[2]
	return seconds * 1000
}

async function setup() {
	try {
		key = await fs.readFile('./key.txt', { encoding: 'utf8' })
	} catch (err) {
		if (!err.message.includes('ENOENT')) throw err
		key = uuid.v4()
		await fs.writeFile('./key.txt', key)
	}

	console.log('your key is: ', key)

	await fs.mkdir('./temp').catch(err => {
		if (!err.message.includes('EEXIST')) throw err
	})

	await fs.rm('./temp/*', { recursive: true, force: true })

	app.listen(4000, () => console.log(`listening on ${ip.address()}:4000`))
}

app.use(async (req, res, next) => {
	if (req?.headers?.authorization?.split(' ')?.pop() !== key) next(createError(403))
	else next()
})

app.post('/temp/:id/cleanup', async (req, res, next) => {
	try {
		await fs.rm(`./temp/${req.params.id}`, { recursive: true, force: true })
		res.status(200).end()
	} catch (err) {
		next(err)
	}
})

app.get('/temp/:id/:preset', async (req, res, next) => {
	res.sendFile(`./temp/${req.params.id}/${req.params.preset}`, { root: __dirname })
})

app.post('/convert/:type', async (req, res, next) => {
	const id = uuid.v4()
	const cleanup = () => fs.rm(`./temp/${id}`, { recursive: true, force: true })

	try {
		let contentType
		let totalDuration

		await fs.mkdir(`./temp/${id}`)

		const source = `./temp/${id}/source`

		const writeStream = createWriteStream(source)
		await new Promise(res => req.pipe(writeStream).on('close', res))

		console.log('presets: ', req.query.presets)

		function convertPhoto(preset) {
			const command = sharp(source).rotate().webp()

			switch (preset) {
				case 'full':
					break
				case 'thumb':
					command.resize(220)
					break
				default:
					return false
			}

			return command.toFile(`./temp/${id}/${preset}`)
		}

		function convertVideo(preset) {
			return new Promise((res, rej) => {
				const command = ffmpeg(source)

				switch (preset) {
					case 'full':
						contentType = 'mp4'
						command.format(contentType).videoCodec('h264_nvenc')
						break
					case 'thumb':
						contentType = 'webp'
						command.format(contentType).size('220x?').frames(1).noAudio()
						break
					case 'thumbvideo':
						contentType = 'mp4'
						totalDuration = 5000
						command.format(contentType).videoCodec('h264_nvenc').size('480x?').noAudio().outputFPS(30).duration(5)
						break
					default:
						return res(false)
				}

				command
					.on('end', async () => {
						console.log('file has been converted succesfully')
						res(true)
					})
					.on('error', async err => {
						console.log('an error happened: ' + err.message)
						rej(err)
					})
					.on('start', cmd => {
						console.log('started: ', cmd)
					})
					.on('codecData', codecData => {
						console.log('codecData: ', codecData)
						if (!totalDuration && codecData.duration !== 'N/A') totalDuration = durationToMs(codecData.duration)
					})
					.on('progress', progress => {
						if (totalDuration) console.log('progress: ', durationToMs(progress.timemark) / totalDuration)
					})
					.save(`./temp/${id}/${preset}`)
			})
		}

		await Promise.all(req.query.presets.map(req.params.type === 'video' ? convertVideo : convertPhoto))

		await fs.rm(source, { recursive: true, force: true })

		res.send({ id })

		setTimeout(cleanup, 1000 * 60 * 2)
	} catch (err) {
		await cleanup()
		next(err)
	}
})

setup()
