node socketTester.js &
node socketTester1.js &
mocha test.js ../package.json
ps aux | grep -i sockettester | awk {'print $2'} | xargs kill
