import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommandResult, StoreEntry } from './models';

@Injectable({ providedIn: 'root' })
export class RedisApiService {
  constructor(private http: HttpClient) {}

  getStore(): Observable<StoreEntry[]> {
    return this.http
      .get<{ keys: StoreEntry[] }>('/api/store')
      .pipe(map((res) => res.keys));
  }

  runCommand(command: string): Observable<CommandResult> {
    return this.http.post<CommandResult>('/api/command', { command });
  }
}
