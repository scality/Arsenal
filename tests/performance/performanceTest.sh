ROOTDIR=$(git rev-parse --show-toplevel)

$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/performance/fileGenerator.js 1 1Byte;
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/performance/fileGenerator.js 1024 1KByte;
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/performance/fileGenerator.js 1048576 1MByte;
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/performance/performanceTest.js
$ROOTDIR/node_modules/babel/bin/babel-node.js \
    $ROOTDIR/tests/performance/performanceJSON.js
rm -rf $ROOTDIR/1Byte $ROOTDIR/1KByte $ROOTDIR/1MByte
