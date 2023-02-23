## Sync

```mermaid
sequenceDiagram
  participant C as Client
  participant LC as Lambda Connect
  participant LM as Lambda Message
  participant D as Database

  autonumber

  C -> LC: connect
  activate LC
  activate C
  LC ->> +D: put Connection
  D -->> -LC: OK

  par Sync Server to Client
    LC ->> +D: get Doc
    D -->> -LC: Doc
    LC ->> LC: syncProtocol.writeSyncStep1()
    LC -) C: send stateVector as SyncStep1
    deactivate LC
    activate C
    C ->> C: syncProtocol.readSyncStep1()
    C -) LM: send update as SyncStep2
    deactivate C
    activate LM
    Note over LM,D: Update Database without conflict
    LM -) C: broadcast update
    deactivate LM

  and Sync Client to Server
    C ->> C: syncProtocol.writeSyncStep1()
    C -) LM: send stateVector as SyncStep1
    deactivate C
    activate LM
    LM ->> +D: get Doc
    D -->> -LM: Doc
    LM ->> LM: syncProtocol.readSyncStep1()
    LM -) C: send update as SyncStep2
    deactivate LM
    activate C
    C ->> C: syncProtocol.readSyncStep2()
    deactivate C

  and Send Update
    activate C
    C ->> C: edit doc
    C -) LM: send Update
    deactivate C
    activate LM
    Note over LM,D: Update Database without conflict
    LM -) C: broadcast update
    deactivate LM
  end
```

## Update Database without conflict

```mermaid
sequenceDiagram
  participant C as Client
  participant LM as Lambda Message
  participant Q as SQS
  participant LU as Lambda Updater
  participant D as Database

  autonumber

  activate LM
  LM ->> +Q: create Queue
  Q -->> -LM: OK
  LU ->> +Q: get Queues
  activate LU
  Q -->> -LU: Queues
  LU ->> +D: get Doc
  D -->> -LU: Doc
  LU ->> LU: syncProtocol.readSyncStep2()
  LU ->> +D: put Doc
  D -->> -LU: OK
  alt when there are connections have not completed to sync
    LU -) C: broadcast update
  end
  LU ->> +Q: delete Queues
  Q -->> -LU: OK
  deactivate LU
  deactivate LM
```
