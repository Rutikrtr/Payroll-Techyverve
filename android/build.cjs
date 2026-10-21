// Builds the Techyverve Android app (Trusted Web Activity) from the live web manifest.
// Usage: node build.cjs            (first run creates the signing key)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { Config, JdkHelper, AndroidSdkTools, KeyTool, TwaGenerator, TwaManifest, ConsoleLog } = require("@bubblewrap/core");

const ROOT = path.join(process.env.USERPROFILE, ".techyverve-android");
const JDK = fs.readdirSync(ROOT).find((d) => d.startsWith("jdk-17"));
const PROJECT = path.join(ROOT, "twa");
const SIGNING = "C:\\Users\\Rutik\\Downloads\\gatpsolutions-us\\android-signing";
const KEYSTORE = path.join(SIGNING, "techyverve-release.keystore");
const PASSFILE = path.join(SIGNING, "KEYSTORE-PASSWORD.txt");
const HOST = "payroll.techyverve.workers.dev";
const ALIAS = "techyverve";

(async () => {
  const log = new ConsoleLog("twa");
  // keytool, gradle and apksigner all need the bundled JDK on PATH.
  const JAVA_HOME = path.join(ROOT, JDK);
  const env = { ...process.env, JAVA_HOME, ANDROID_HOME: path.join(ROOT, "sdk"), PATH: `${path.join(JAVA_HOME, "bin")};${process.env.PATH}` };
  Object.assign(process.env, env);
  const config = new Config(path.join(ROOT, JDK), path.join(ROOT, "sdk"));
  const jdk = new JdkHelper(process, config);
  await AndroidSdkTools.create(process, config, jdk, log); // validates the SDK path

  // Signing key: created once, reused for every future update (Android rejects updates signed differently).
  fs.mkdirSync(SIGNING, { recursive: true });
  let password;
  if (fs.existsSync(KEYSTORE)) {
    password = fs.readFileSync(PASSFILE, "utf8").match(/password: (\S+)/)[1];
  } else {
    password = crypto.randomBytes(18).toString("base64url");
    await new KeyTool(jdk, log).createSigningKey({
      fullName: "Techyverve Solutions", organizationalUnit: "IT", organization: "Techyverve Solutions Private Limited",
      country: "IN", password, keypassword: password, alias: ALIAS, path: KEYSTORE,
    });
    fs.writeFileSync(PASSFILE, `Techyverve Android signing key. BACK THIS UP. Losing it means the app can never be updated.\nkeystore: ${KEYSTORE}\nalias: ${ALIAS}\npassword: ${password}\n`);
  }

  const manifest = await TwaManifest.fromWebManifest(`https://${HOST}/manifest.webmanifest`);
  Object.assign(manifest, {
    packageId: "com.techyverve.payroll",
    host: HOST,
    name: "Techyverve Payroll",
    launcherName: "Techyverve",
    startUrl: "/",
    themeColor: manifest.themeColor, navigationColor: manifest.themeColor,
    enableNotifications: false,
    fallbackType: "customtabs",
    orientation: "portrait",
    appVersionCode: 1, appVersionName: "1.0.0",
    signingKey: { path: KEYSTORE, alias: ALIAS },
  });
  // Bubblewrap only enables these features when asked; the scanner needs camera + location.
  manifest.features = { locationDelegation: { enabled: true } };

  fs.rmSync(PROJECT, { recursive: true, force: true });
  await new TwaGenerator().createTwaProject(PROJECT, manifest, log);
  await manifest.saveToFile(path.join(PROJECT, "twa-manifest.json"));

  // Bubblewrap's Gradle/sign helpers don't resolve .bat files on Windows, so call the tools directly.
  const run = (cmd, args, cwd) => execFileSync("cmd.exe", ["/c", cmd, ...args], { cwd, env, stdio: "inherit" });
  run(path.join(PROJECT, "gradlew.bat"), ["assembleRelease", "--no-daemon", "-q"], PROJECT);

  const BT = path.join(ROOT, "sdk", "build-tools", fs.readdirSync(path.join(ROOT, "sdk", "build-tools")).sort().pop());
  const unsigned = path.join(PROJECT, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
  const aligned = path.join(PROJECT, "app-release-aligned.apk");
  const signed = path.join(ROOT, "techyverve.apk");
  run(path.join(BT, "zipalign.exe"), ["-p", "-f", "4", unsigned, aligned], PROJECT);
  run(path.join(BT, "apksigner.bat"), ["sign", "--ks", KEYSTORE, "--ks-key-alias", ALIAS, "--ks-pass", `pass:${password}`, "--key-pass", `pass:${password}`, "--out", signed, aligned], PROJECT);
  run(path.join(BT, "apksigner.bat"), ["verify", signed], PROJECT);

  console.log("APK:", signed, fs.statSync(signed).size, "bytes");
  console.log("Copy it to public/downloads/techyverve.apk. If the signing key changed, update public/.well-known/assetlinks.json.");
})().catch((e) => { console.error(e); process.exit(1); });
