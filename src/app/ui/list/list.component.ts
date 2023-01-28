import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { from, orderBy, filter } from 'leseq';
import { GithubService, PostMeta } from 'src/app/service/github.service';
import { SettingsService } from 'src/app/service/settings.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit, OnDestroy {
  loading = true;
  items: readonly PostMeta[] = [];

  constructor(
    private github: GithubService,
    private router: Router,
  ) {
  }

  async ngOnInit(): Promise<void> {
    try {
      this.loading = true;
      this.items = await this.github.listPosts();
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
  }

  async onClickItem(item: PostMeta) {
    await this.router.navigate(['edit', item.name]);
  }
}
