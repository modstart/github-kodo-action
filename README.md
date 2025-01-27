# Github Action for Kodo Upload

使用断点续传，可以上传大文件到 Kodo

## Inputs

## 必须

- `title`: 打包说明
- `bucket`: Bucket 名称
- `accessKey`: accessKey
- `secretKey`: secretKey
- `domain`: 域名
- `zone`: zone
- `assets`: 上传的资源。每行一条规则，格式：`源路径:目标路径`
- `callback`: 可选，上传完成后的回调地址，上传完成后会以 `GET` 请求的方式调用该地址
- `callbackUrlExpire`: 可选，回调地址的有效期，默认 604800（7 天），单位：秒

## Outputs

- `none`

## Usage

```yaml
- name: Upload to Koeo
  uses: modstart/github-kodo-action@master
  with:
    assets: |
      a/**:/remote-a/
      b/**:/remote-b/
      c.txt:/rc.txt
```

## 高级功能

### 上传回调

这个参数可以用来通知上传完成，如果 `callback` 参数不为空，上传完成后会以 `GET` 请求的方式调用该地址，参数如下：

```
GET https://www.example.com/callback?data={"file1":"url1","file2":"url2"}
```

其中 `url1` 和 `url2` 是上传后的文件地址，会自动使用 `callbackUrlExpire` 参数设置的有效期生成临时地址。

