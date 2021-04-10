---
layout: post
title:  "Just pause selenium for python"
date:   2017-11-06 11:41 +0800
---

When I use `selenium` to test page, I just want to pause some seconds, and then to do some work. Firstly, I try to use `time.sleep(seconds)` of `python`, but the `selenium` will behaviour illegitimate. So I start to find solution from `selenium`.

```
def just_wait(driver, seconds):
    try:
        WebDriverWait(driver, seconds).until(
            EC.presence_of_element_located(
                By.ID, 'fucking_selenium_pause_method'
            )
        )
    except Exception as e:
        print('Yes after %s seconds pause, %s' % (seconds, e)) 
```

Above code is a template to pause when I use `selenium`. The `WebDriverWait` is the explicit wait solution for finding elements of `selenium`, so if I use it to find a not-existed element with some seconds, it will timeout and failed after these seconds, which can achieve a pause and the `selenium`
will work correctly. In the project, above code works fine.

