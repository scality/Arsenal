./node_modules/babel/bin/babel-node.js test/socketTester.js &
./node_modules/babel/bin/babel-node.js test/socketTester1.js &
mocha test/test.js
ps aux | grep -i sockettester | awk {'print $2'} | xargs kill
