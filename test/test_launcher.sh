node test/socketTester.js &
node test/socketTester1.js &
mocha test/test.js ./package.json
ps aux | grep -i sockettester | awk {'print $2'} | xargs kill
