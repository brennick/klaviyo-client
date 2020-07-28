import { KlaviyoProfileIdentifier, KlaviyoProfile, KlaviyoEvent } from './klaviyo.types';
import axios, { AxiosError } from 'axios';

export class KlaviyoClient {
  constructor(private readonly apiKey: string, private readonly token: string) {}

  // See https://www.klaviyo.com/docs/api/v2/lists#get-members-all for details
  public async getGroupProfiles(groupId: string, marker: number = null): Promise<KlaviyoProfileIdentifier[]> {
    const profiles: KlaviyoProfileIdentifier[] = [];
    const params = { api_key: this.apiKey, marker };

    try {
      let response = await axios.get<GroupMembersResponse>(`v2/group/${groupId}/members/all`, { data: params });
      profiles.push(...response.data.records);

      while (response.data.marker) {
        params.marker = response.data.marker;
        response = await axios.get<GroupMembersResponse>(`v2/group/${groupId}/members/all`, { data: params });

        profiles.push(...response.data.records);
      }
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 404) {
          return profiles;
        }

        if (e.response.status === 429) {
          await this.waitForRetry(e);
          const nextProfiles = await this.getGroupProfiles(groupId, params.marker);
          profiles.push(...nextProfiles);
          return profiles;
        }
      }

      throw e;
    }

    return profiles;
  }

  // See https://www.klaviyo.com/docs/api/people#person for details
  public async getProfile(id: string): Promise<KlaviyoProfile> {
    const params = { api_key: this.apiKey };

    try {
      const response = await axios.get<KlaviyoProfile>(`v1/person/${id}`, { params });

      return response.data;
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 404) {
          return null;
        }

        if (e.response.status === 429) {
          await this.waitForRetry(e);
          return await this.getProfile(id);
        }
      }

      throw e;
    }
  }

  // See https://www.klaviyo.com/docs/api/people#metrics-timeline for details
  public async getProfileEvents(id: string, since: string = null): Promise<KlaviyoEvent[]> {
    const events: KlaviyoEvent[] = [];
    const params = { api_key: this.apiKey, since };

    try {
      let response = await axios.get<PersonEventsResponse>(`v1/person/${id}/metrics/timeline`, { params: params });

      events.push(...response.data.data);

      while (response.data.next) {
        params.since = response.data.next;
        response = await axios.get<PersonEventsResponse>(`v1/person/${id}/metrics/timeline`, { params: params });

        events.push(...response.data.data);
      }
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 404) {
          return events;
        }

        if (e.response.status === 429) {
          await this.waitForRetry(e);
          events.push(...(await this.getProfileEvents(id, params.since)));
          return events;
        }
      }

      throw e;
    }

    return events;
  }

  // See https://www.klaviyo.com/docs/http-api#identify for details
  public async identify(profile: Partial<KlaviyoProfile>): Promise<boolean> {
    const params = {
      token: this.token,
      properties: profile,
    };

    const payload = btoa(JSON.stringify(params));

    try {
      const response = await axios.get<boolean>(`identify`, { params: { data: payload } });

      return response.data;
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 429) {
          await this.waitForRetry(e);
          return await this.identify(profile);
        }
      }

      throw e;
    }
  }

  // See https://www.klaviyo.com/docs/http-api#track for details
  public async track(
    eventName: string,
    profile: Partial<KlaviyoProfile>,
    event: Record<string, unknown>,
  ): Promise<boolean> {
    const params = {
      token: this.token,
      event: eventName,
      customer_properties: profile,
      properties: event,
    };
    const payload = btoa(JSON.stringify(params));

    try {
      const response = await axios.get<boolean>(`track`, { params: { data: payload } });

      return response.data;
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 429) {
          await this.waitForRetry(e);
          return await this.track(eventName, profile, event);
        }
      }

      throw e;
    }
  }

  private async waitForRetry(e: AxiosError) {
    const time = 1000 * e.response.headers['retry-after'] || 3000;
    await new Promise((resolve) => setTimeout(resolve, time));
  }
}

interface PersonEventsResponse {
  count: number;
  object: string;
  data: KlaviyoEvent[];
  next: string;
}

interface GroupMembersResponse {
  marker: number;
  records: KlaviyoProfileIdentifier[];
}