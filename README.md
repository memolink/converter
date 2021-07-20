You should have PATH variable pointing to [ffmpeg](https://ffmpeg.org/download.html) binaries.  
Default is nvenc encoder. If you need something else change it [here](https://github.com/memolink/converter/blob/master/index.js#L81) and [here](https://github.com/memolink/converter/blob/master/index.js#L92).  
You can get codecs available in your build of ffmpeg by running `ffmpeg -codecs`  

Install required modules by running `npm i`  
After that you can run the server with `npm run start`  
You'll get your key and ip in the output. The key is persisted in `key.txt`
