ROOTDIR=$(git rev-parse --show-toplevel)

$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/functional/socketTester.js &
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/functional/socketTester1.js &
mocha --compilers js:babel/register $ROOTDIR/tests/functional/test.js
ps aux | grep -i sockettester | awk {'print $2'} | xargs kill
