const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils');

const bannedStr = 'banned';
const prefixBlacklist = [];

// byte size of 915
const keyutf8 = '%EA%9D%8B崰㈌㒈保轖䳷䀰⺩ቆ楪秲ⴝ㿅鼎ꓜ퇬枅࿷염곞召㸾⌙ꪊᆐ庍뉆䌗幐鸆䛃➟녩' +
    'ˍ뙪臅⠙≼绒벊냂詴 끴鹲萯⇂㭢䈊퉉楝舳㷖족痴䧫㾵᏷ำꎆ꼵껪멷㄀誕㳓腜쒃컹㑻鳃삚舿췈孨੦⮀Ǌ곓⵪꺼꜈' +
    '嗼뫘悕錸瑺⁤륒㜓垻ㆩꝿ詀펉ᆙ舑䜾힑藪碙ꀎꂰ췊Ᏻ  㘺幽醛잯ද汧Ꟑꛒⶨ쪸숞헹㭔ꡔᘼ뺓ᡆ᡾ᑟ䅅퀭耓弧⢠⇙' +
    '폪ް蛧⃪Ἔ돫ꕢ븥ヲ캂䝄쟐颺ᓾ둾Ұ껗礞ᾰ瘹蒯硳풛瞋襎奺熝妒컚쉴⿂㽝㝳駵鈚䄖戭䌸᫲ᇁ䙪鸮ᐴ稫ⶭ뀟ھ⦿' +
    '䴳稉ꉕ捈袿놾띐✯伤䃫⸧ꠏ瘌틳藔ˋ㫣敀䔩㭘식↴⧵佶痊牌ꪌ搒꾛æᤈべ쉴挜敗羥誜嘳ֶꫜ걵ࣀ묟ኋ拃秷膤䨸菥' +
    '䟆곘縧멀煣卲챸⧃⏶혣ਔ뙞밺㊑ک씌촃Ȅ頰ᖅ懚ホῐ꠷㯢먈㝹୥밷㮇䘖桲阥黾噘烻ᓧ鈠ᴥ徰穆ꘛ蹕綻表鯍裊' +
    '鮕漨踒ꠍ픸Ä☶莒浏钸목탬툖氭ˠٸ൪㤌ᶟ訧ᜒೳ揪Ⴛ摖㸣᳑⹞걀ꢢ䏹ῖ"';

describe('routesUtils.isValidObjectKey', () => {
    it('should return isValid false if object key name starts with a ' +
    'blacklisted prefix', () => {
        const result = routesUtils.isValidObjectKey('bannedkey', [bannedStr]);
        // return { isValid: false, invalidPrefix };
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.invalidPrefix, bannedStr);
    });

    it('should return isValid false if object key name exceeds length of 915',
        () => {
            const key = 'a'.repeat(916);
            const result = routesUtils.isValidObjectKey(key, prefixBlacklist);
            assert.strictEqual(result.isValid, false);
        });

    it('should return isValid true for a utf8 string of byte size 915', () => {
        const result = routesUtils.isValidObjectKey(keyutf8, prefixBlacklist);
        assert.strictEqual(result.isValid, true);
    });
});
