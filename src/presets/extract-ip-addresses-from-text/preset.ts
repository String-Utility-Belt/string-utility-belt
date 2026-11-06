import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'extract-ip-addresses-from-text',
  name: 'Extract IP addresses from text and count them',
  summary:
    'Paste a log, an email or any text and get every IPv4 address in it, each once, with how many times it appears, most frequent first and ties in address order, as a tab-separated list for a spreadsheet or a block list.',
  category: 'DevOps & Config',
  primaryQuery: 'extract ip addresses from text',
  published: '2026-11-06',
  related: ['parse-user-agents-from-access-log', 'extract-unique-emails-from-text', 'extract-domains-from-urls'],
  steps: [
    step('find', 'extract_preset', { type: ['ipv4'] },
      'Pulls out every IPv4 address, one per line, and nothing else. Each of the four numbers must be 0 to 255 and stand on its own, so a version number like 2.5.1, a timestamp or 10.0.0.256 is not picked up, and an address inside a sentence or a log line is.',
      { label: 'find every IPv4 address' }),
    step('order', 'line_sort', { mode: 'natural' },
      'Sorts the addresses numerically, octet by octet, so 192.0.2.8 comes before 192.0.2.10. The count that follows keeps equal counts in the order it first sees them, which makes this the order of ties in the final list instead of the order the log happened to use.',
      { label: 'sort the addresses' }),
    step('count', 'uniq_count', { sort: 'count-desc', format: 'count-line', separator: '\t' },
      'Collapses repeats into one line per address with how many times it appeared, most frequent first, count and address separated by a tab. The tab pastes into two spreadsheet columns, and the second column alone is a deduplicated address list.',
      { label: 'count each address' }),
  ],
  samples: [
    {
      id: 'sshd-auth-log',
      title: 'sshd lines from auth.log',
      input: 'Nov  6 09:14:02 bastion sshd[2231]: Failed password for root from 203.0.113.42 port 51522 ssh2\nNov  6 09:14:05 bastion sshd[2231]: Failed password for root from 203.0.113.42 port 51530 ssh2\nNov  6 09:14:09 bastion sshd[2240]: Failed password for invalid user admin from 198.51.100.17 port 40112 ssh2\nNov  6 09:14:11 bastion sshd[2244]: Accepted publickey for deploy from 192.0.2.8 port 60210 ssh2\nNov  6 09:14:15 bastion sshd[2231]: Failed password for root from 203.0.113.42 port 51544 ssh2\nNov  6 09:14:20 bastion sshd[2251]: Failed password for invalid user test from 203.0.113.9 port 39876 ssh2\nNov  6 09:14:26 bastion sshd[2255]: Accepted publickey for deploy from 192.0.2.8 port 60218 ssh2\nNov  6 09:14:31 bastion sshd[2260]: Failed password for invalid user admin from 198.51.100.17 port 40120 ssh2\n',
      output: '3\t203.0.113.42\n2\t192.0.2.8\n2\t198.51.100.17\n1\t203.0.113.9',
    },
    {
      id: 'nginx-access-log',
      title: 'nginx access log',
      input: '203.0.113.7 - - [06/Nov/2026:10:02:11 +0000] "GET /api/orders HTTP/1.1" 200 512 "-" "curl/8.5.0"\n198.51.100.23 - - [06/Nov/2026:10:02:12 +0000] "POST /api/orders HTTP/1.1" 201 88 "-" "python-requests/2.32"\n203.0.113.7 - - [06/Nov/2026:10:02:14 +0000] "GET /api/orders/42 HTTP/1.1" 200 640 "-" "curl/8.5.0"\n192.0.2.33 - - [06/Nov/2026:10:02:15 +0000] "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.31"\n203.0.113.7 - - [06/Nov/2026:10:02:19 +0000] "GET /api/orders?page=2 HTTP/1.1" 200 530 "-" "curl/8.5.0"\n192.0.2.33 - - [06/Nov/2026:10:02:25 +0000] "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.31"\n',
      output: '3\t203.0.113.7\n2\t192.0.2.33\n1\t198.51.100.23',
    },
    {
      id: 'incident-notes',
      title: 'Addresses mentioned in prose',
      input: 'Our scanner flagged 192.0.2.10 and 192.0.2.11 on Monday; 192.0.2.10 came back on Tuesday. Agent version 2.5.1 is installed on 10.0.0.256 (a typo in the ticket: the host is 10.0.0.25).',
      output: '2\t192.0.2.10\n1\t10.0.0.25\n1\t192.0.2.11',
    },
  ],
}
export default preset
