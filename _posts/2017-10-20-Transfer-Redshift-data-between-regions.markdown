---
layout: post
title:  "Transfer Redshift data between regions"
date:   2017-10-11 23:22 +0800
---

Firstly, use aws's `UNLOAD` command to save your redshift data to s3.

```
UNLOAD('your select sql statement')
TO 's3://bucketname/directory/file_prefix'
ACCESS_KEY_ID 'aws_id'
SECRET_ACCESS_KEY 'aws_key'
ALLOWOVERWRITE
ADDQUOTES
ESCAPE
PARALLEL OFF
GZIP
MANIFEST
```

Above is just a `unload` template, just replace s3 location to save files which contains redshift data, aws key id and access key, also `select` command to select data what will be saved.

There are some extra command flags need explained:

1. `ALLOWOVERWRITE` : The command can override origin existed data.

2. `ADDQUOTES` : The default delimiter of `upload` command is pipe symbol, maybe you can use other delimiter, but we can not ensure the delimiter is not a part of some data. So just use `ADDQUOTES` to quote column data with `""`, which can help fix the problem that delimiter symbol may be contained in column data.

3. `ESCAPE` : Add `\` before some specific characters for `CHAR` and `VARCHAR` columns in unload files, such as: `\r`, `\n`, delimited character in unloaded data, `\`,  `"` and `'`.

4. `PARALLEL` : The redishfit will split saved data to multi files, but I think it is not useful if we want to download saved data files in s3 of one region to another region. So just use off to close it, and redshift will save data in one file as far as possible, if the data content is not exceed `6.2GB`. It will helpful if you want to decrease data files number.

5. `GZIP` : Use `gzip` compression to compress the saved data file to save s3 storage and decrease download bandwidth price.

6. `MANIFEST` : Use a manifest file to save the saved data files url. 

And then download the manifest and saved data files to your local computer, and upload these files to your s3 in another region. Lastly, use below template code to insert data to your redshift in your new region.

```
COPY table_name
FROM 's3://bucketname/directory/manifest_file_name'
ACCESS_KEY_ID 'aws_id'
SECRET_ACCESS_KEY 'aws_key'
MANIFEST 
DATEFORMAT 'auto' 
TIMEFORMAT 'auto' 
ESCAPE 
GZIP 
REMOVEQUOTES;
```

1. Use `MANIFEST` to tell the `COPY` command use manifest file to find the files to import.

2. Use `DATEFORMAT` and `TIMEFORMTAT` with `auto` to let `COPY` command to process data and time format.

3. Use `ESCAPE` to delete `\` added by `UNLOAD`. So they occur with the each other in `UNLOAD` and `COPY`.

4. Use `GZIP` to uncompressed gzip file.

5. Use `REMOVEQUOTES` to remove quotes added by `UNLOAD` command.

The entire process is that save one region redshift data to s3 in the same region, then download s3 data in this region and upload it to s3 in another region, lastly just copy s3 data in another region to redshift in the same region. But there are something need to be focused.

If we want to transfer region A data to region B, so we save region A data to s3 in region A with directory `s3://bucketname/data_transfer/data_transfer_`. The above `UNLOAD` command will save data to `data_transfer_00`(maybe more files) and `data_transfer_manifest`. The `data_transfer_manifest` will save the data file location with `s3://bucketname/data_transfer/data_transfer_000`. 

In region B, we must use same directory `s3://bucketname/data_transfer` to save uploaded data files. If not, the `COPY` command will do nothing because it can not find data file, or tell your error if you add `"mandatory":true` in manifest file.

Ref: 

[Redshift COPY command](http://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html)

[Redshift UNLOAD command](http://docs.aws.amazon.com/redshift/latest/dg/r_UNLOAD.html)
