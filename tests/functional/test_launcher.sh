ROOTDIR=$(git rev-parse --show-toplevel)

$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/functional/socketTester.js &
        PID=$!
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/functional/socketTester1.js &
        PID1=$!

sleep 0.3

mocha --compilers js:babel/register $ROOTDIR/tests/functional/test.js

pkill -P $PID
pkill -P $PID1
