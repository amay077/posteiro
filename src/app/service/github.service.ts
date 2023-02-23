import { Injectable } from '@angular/core';
import { filter, from, map, orderBy } from 'leseq';
import { ulid } from 'ulid';
import { SettingsService } from './settings.service';
import { Buffer } from 'buffer';
import * as dayjs from 'dayjs';
import { parse } from '../misc/front-matter-parser';
import { CacheService } from './cache.service';

export type PostMeta = {
  name: string,
  download_url: string,
  sha?: string,
  title?: string,
  posted_at?: Date
 };

@Injectable({
  providedIn: 'root'
})
export class GithubService {
  constructor(
    private settings: SettingsService,
    private cache: CacheService) { }

  async listPosts(): Promise<readonly PostMeta[]> {
    const settings = this.settings.repository;
    if (settings == null) {
      return [];
    }

    const token = settings.github_access_token;
    const owner = settings.repository_owner;
    const repo = settings.repository_name;
    const branch = settings.branch_name;
    const path_to_posts = settings.path_to_posts;

    const params = { ref : branch };
    const query = new URLSearchParams(params);

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path_to_posts}?${query}`;

    const p: RequestInit = {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    };

    const res = await fetch(url, p);
    const metaCache = this.cache.metaCache;
    if (res.ok) {
      const resJson = await res.json() as PostMeta[];
      return from(resJson).pipe(
        map(x => {
          const cachedMeta = metaCache.find(y => y.download_url == x.download_url)
          if (cachedMeta != null) {
            x.title = cachedMeta.title;
            x.posted_at = cachedMeta.posted_at;
          }
          return x;
        }),
        orderBy(x => x.name, 'desc'),
        filter(x => x.name.toLowerCase().endsWith('md') || x.name.toLowerCase().endsWith('markdown'))
      ).toArray();
      console.log(`${this.constructor.name} ~ ngOnInit ~ resJson`, resJson);
    } else {
      console.log(`${this.constructor.name} ~ ngOnInit ~ res.status`, res.status);
      return [];
    }
  }

  async getPostMeta(name: string): Promise<{ meta: PostMeta, markdown: string} | undefined> {
    const settings = this.settings.repository;
    if (settings == null) {
      return undefined;
    }

    const token = settings.github_access_token;
    const owner = settings.repository_owner;
    const repo = settings.repository_name;
    const branch = settings.branch_name;
    const path_to_posts = settings.path_to_posts;

    const params = { ref : branch };
    const query = new URLSearchParams(params);

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path_to_posts}/${name}?${query}`;

    const p: RequestInit = {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    };
    const res = await fetch(url, p);
    if (res.ok) {
      const json = await res.json() as {
        name: string,
        download_url: string,
        sha?: string,
        content: string,
       };
      const meta: PostMeta = {
        name: json.name,
        download_url: json.download_url,
        sha: json.sha,
      }
      const markdown = Buffer.from(json.content, 'base64').toString();

      const frontMatter = parse(markdown);
      meta.title = frontMatter?.data?.title;
      meta.posted_at = ((date) => {
        if (date == null) { return undefined; }
        return new Date(date);
      })(frontMatter?.data?.date);
      this.cache.putMeta(meta);

      console.log(`${this.constructor.name} ~ ngOnInit ~ resJson`, meta);
      return { meta, markdown };
    } else {
      console.log(`${this.constructor.name} ~ ngOnInit ~ res.status`, res.status);
      return undefined;
    }
  }

  async uploadImage(file: File): Promise<string | undefined> {
    const settings = this.settings.repository;
    if (settings == null) {
      return undefined;
    }

    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        console.log('readAsDataURL start', new Date().getTime());
        reader.readAsDataURL(file);
        reader.onload = (r) => {
          console.log('readAsDataURL end', new Date().getTime());
          console.log('replace start', new Date().getTime());
          const prefix = `data:${file.type}:base64,`;
          const base64str = (r.target?.result as string).substring(prefix.length);
          console.log('replace end', new Date().getTime());
          resolve(base64str);
        };
        reader.onerror = (e) => reject(e);
      });
    };

    console.log('fileToBase64 start', new Date().getTime());
    const content = await fileToBase64(file);
    console.log('fileToBase64 end', new Date().getTime());

    const data = JSON.stringify({
      'branch': settings.branch_name,
      'message': 'upload image via POSTEIRO',
      'content': `${content}`
    });

    const token = settings.github_access_token;
    const owner = settings.repository_owner;
    const repo = settings.repository_name;

    const extPos = file.name?.lastIndexOf('.') + 1 ?? -1;
    const ext = extPos > 0 ? file.name.substring(extPos) : 'png';
    const date = dayjs().format('YYYY-MM-DD');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.path_to_images}/${date}-${ulid()}.${ext}`;

    const p = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type
      },
      body: data
    };

    const res = await fetch(url, p);
    if (res.ok) {
      const resJson = await res.json();
      console.log(`${this.constructor.name} ~ doUpload ~ resJson`, resJson, resJson.content.download_url);

      return resJson.content.download_url;
    } else {
      return undefined;
    }
  }

  async uploadPost(markdown: string, name: string, sha?: string): Promise<string | undefined> {
    const settings = this.settings.repository;
    if (settings == null) {
      return undefined;
    }

    const content = Buffer.from(markdown).toString('base64');

    const data = JSON.stringify({
      sha,
      'branch': settings.branch_name,
      'message': 'upload post via POSTEIRO',
      'content': content
    });

    const token = settings.github_access_token;
    const owner = settings.repository_owner;
    const repo = settings.repository_name;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.path_to_posts}/${name}`;

    const p = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: data
    };

    const res = await fetch(url, p);
    if (res.ok) {
      const resJson = await res.json();
      console.log(`${this.constructor.name} ~ doUpload ~ resJson`, resJson, resJson.content.download_url);

      return resJson.content.download_url;
    } else {
      return undefined;
    }
  }

  async deletePost(name: string, sha: string): Promise<void | undefined> {
    const settings = this.settings.repository;
    if (settings == null) {
      return undefined;
    }

    const data = JSON.stringify({
      sha,
      'branch': settings.branch_name,
      'message': 'delete post via POSTEIRO',
    });

    const token = settings.github_access_token;
    const owner = settings.repository_owner;
    const repo = settings.repository_name;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.path_to_posts}/${name}`;

    const p = {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: data
    };

    const res = await fetch(url, p);
    if (res.ok) {
      return;
    } else {
      return undefined;
    }
  }
}
