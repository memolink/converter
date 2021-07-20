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

async function setupAuth() {
	try {
		key = await fs.readFile('./key.txt', { encoding: 'utf8' })
	} catch (err) {
		if (!err.message.includes('ENOENT')) throw err
		key = uuid.v4()
		await fs.writeFile('./key.txt', key)
	}

	console.log('your key is: ', key)

	app.listen(4000, () => console.log(`listening on ${ip.address()}:4000`))
}

app.use(async (req, res, next) => {
	if (req?.headers?.authorization?.split(' ')?.pop() !== key) next(createError(403))
	else next()
})

app.post('/photo', async (req, res, next) => {
	try {
		const command = sharp().rotate().webp()

		switch (req.query.preset) {
			case 'full':
				break
			case 'thumb':
				command.resize(220)
				break
			default:
				return next(createError(400, 'Preset not supported'))
		}

		console.log('converting image with preset: ', req.query.preset)

		req.pipe(command).pipe(res)
	} catch (err) {
		next(err)
	}
})

app.post('/video', async (req, res, next) => {
	try {
		let contentType
		let totalDuration

		let cleanup = () => {}
		let source = req
		if (!req.query.streamable) {
			source = './temp/' + uuid.v4()
			const writeStream = createWriteStream(source)
			await new Promise(res => req.pipe(writeStream).on('close', res))
			cleanup = fs.unlink(source)
		}

		const command = ffmpeg(source)

		switch (req.query.preset) {
			case 'full':
				contentType = 'mp4'
				command.format(contentType).videoCodec('h264_nvenc').addOutputOption('-movflags', 'frag_keyframe+empty_moov')
				break
			case 'thumb':
				contentType = 'webp'
				command.format(contentType).size('220x?').frames(1).noAudio()
				break
			case 'thumbvideo':
				contentType = 'mp4'
				totalDuration = 5000
				command
					.format(contentType)
					.videoCodec('h264_nvenc')
					.size('480x?')
					.noAudio()
					.outputFPS(30)
					.duration(5)
					.addOutputOption('-movflags', 'frag_keyframe+empty_moov')
				break
			default:
				cleanup()
				return next(createError(400, 'Preset not supported'))
		}

		command
			.on('end', async () => {
				console.log('file has been converted succesfully')
				cleanup()
			})
			.on('error', async err => {
				console.log('an error happened: ' + err.message)
				next(err)
				cleanup()
			})
			.on('start', cmd => {
				console.log('started: ', cmd)
			})
			.on('codecData', codecData => {
				console.log('codecData: ', codecData)
				if (!totalDuration && codecData.duration !== 'N/A') totalDuration = durationToMs(codecData.duration)
			})
			.on('progress', progress => {
				if (!res.headersSent) {
					res.contentType(contentType)
					passStream.pipe(res)
				}

				if (totalDuration) console.log('progress: ', durationToMs(progress.timemark) / totalDuration)
			})

		const passStream = new stream.PassThrough()
		const dataStream = command.pipe(passStream, { end: true })
	} catch (err) {
		next(err)
	}
})

setupAuth()
