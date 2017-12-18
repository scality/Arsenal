# Get Pensieve Credentials Executable

## To make executable file from getPensieveCreds.js

`npm install -g pkg`
`pkg getPensieveCreds.js`

This will build a mac, linux and windows file.
If you just want linux, for example:
`pkg getPensieveCreds.js --targets node6-linux-x64`

For further options, see https://github.com/zeit/pkg

## To run the executable file

Call the output executable file with an
argument that names the service you
are trying to get credentials for:

`./getPensieveCreds-linux serviceName`