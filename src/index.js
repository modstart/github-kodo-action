const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const {resolve} = require('path');
const fg = require('fast-glob');
const path = require('path');
const axios = require('axios');
const qiniu = require('qiniu');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

const formatSize = (size) => {
    if (size < 1024) {
        return size + 'B';
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + 'KB';
    } else if (size < 1024 * 1024 * 1024) {
        return (size / 1024 / 1024).toFixed(2) + 'MB';
    } else {
        return (size / 1024 / 1024 / 1024).toFixed(2) + 'GB';
    }
}

(async () => {

    const title = core.getInput('title')
    const callback = core.getInput('callback');
    const callbackUrlExpire = core.getInput('callbackUrlExpire');
    const assets = core.getInput('assets', {required: true})
    const timeout = core.getInput('timeout')

    const bucket = core.getInput('bucket');
    const accessKey = core.getInput('accessKey');
    const secretKey = core.getInput('secretKey');
    const domain = core.getInput('domain');
    const zone = core.getInput('zone');

    qiniu.conf.ACCESS_KEY = accessKey;
    qiniu.conf.SECRET_KEY = secretKey;

    const uploadOneFile = async (localPath, key) => {
        let lastPercentage = null;
        return new Promise((resolve, reject) => {
            try {
                core.info(`upload ${localPath} to ${key}`)
                const config = new qiniu.conf.Config();
                config.regionsProvider = qiniu.httpc.Region.fromRegionId(zone);
                const resumeUploader = new qiniu.resume_up.ResumeUploader(config);
                const putExtra = new qiniu.resume_up.PutExtra();
                putExtra.progressCallback = (uploadBytes, totalBytes) => {
                    const percentage = Math.floor(uploadBytes / totalBytes * 100);
                    if (lastPercentage !== percentage) {
                        core.info(`upload progress: ${percentage}%`);
                        lastPercentage = percentage;
                    }
                }
                const putPolicy = new qiniu.rs.PutPolicy({
                    scope: bucket
                })
                const uploadToken = putPolicy.uploadToken();
                resumeUploader
                    .putFile(uploadToken, key, localPath, putExtra)
                    .then(({data, resp}) => {
                        if (resp.statusCode === 200) {
                            core.info('upload success')
                            resolve(undefined);
                        } else {
                            throw new Error(`upload failed: ${resp.statusCode} ${resp.body}`)
                        }
                    });
            } catch (e) {
                core.error(e);
                core.setFailed(e.message)
                reject(e);
            }
        })
    }

    const getFileUrl = (key) => {
        const mac = new qiniu.auth.digest.Mac(qiniu.conf.ACCESS_KEY, qiniu.conf.SECRET_KEY);
        const config = new qiniu.conf.Config();
        const bucketManager = new qiniu.rs.BucketManager(mac, config);
        const deadline = parseInt(Date.now() / 1000) + callbackUrlExpire;
        return bucketManager.privateDownloadUrl(domain, key, deadline);
    }

    try {
        let successUrls = [];
        for (let rule of assets.split('\n')) {
            const [src, dst] = rule.split(':')
            const files = fg.sync([src], {dot: false, onlyFiles: true})
            core.info(`glob for rule: ${rule} - ${JSON.stringify(files)}`)
            if (!files.length) {
                continue;
            }
            if (/\/$/.test(dst)) {
                for (let file of files) {
                    const filename = path.basename(file)
                    await uploadOneFile(file, `${dst}${filename}`)
                    successUrls.push({
                        name: filename,
                        path: `${dst}${filename}`,
                        size: fs.statSync(file).size
                    })
                }
            } else {
                await uploadOneFile(files[0], dst)
                successUrls.push({
                    name: path.basename(files[0]),
                    path: dst,
                    size: fs.statSync(files[0]).size
                })
            }
        }

        if (callback && successUrls.length > 0) {
            core.info(`callback for : ${successUrls.length} urls`)
            let postData = {}
            if (title) {
                postData['title'] = title
            }
            successUrls.forEach((url, index) => {
                const key = [
                    url.name,
                    `(${formatSize(url.size)})`,
                ].join('')
                postData[key] = getFileUrl(url.path)
            })
            // GET callback with data = {successUrls}
            const res = await axios.get(callback, {
                params: {
                    data: JSON.stringify(postData)
                },
                proxy: false
            })
            core.info(`callback response: ${res.status} ${res.statusText} ${JSON.stringify(res.data)}`)
        }

    } catch (err) {
        core.setFailed(err.message)
    }
})()
